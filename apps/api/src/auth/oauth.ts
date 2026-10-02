import { randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import type { AppConfig } from '../config.js';
import type { OAuthProviderId, StoredToken, TokenStore } from './token-store.js';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'];
/**
 * GitHub OAuth Apps have no read-only repository scope: `repo` grants read AND write on repositories.
 * This project only calls read endpoints, but the token itself is not read-only.
 * For least privilege, register a GitHub App with read-only permissions (Contents, Issues,
 * Pull requests, Metadata) and set GITHUB_OAUTH_SCOPES="" — GitHub App user tokens take their
 * permissions from the app, not from a scope parameter.
 */
export const DEFAULT_GITHUB_SCOPES = ['read:user', 'repo'];
export function githubScopesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env['GITHUB_OAUTH_SCOPES'];
  if (raw === undefined) return DEFAULT_GITHUB_SCOPES;
  return raw.split(/[\s,]+/).filter(Boolean);
}

export type IntegrationStatus = 'not_configured' | 'disconnected' | 'connected';

/** OAuth 2.0 authorization-code flow for GitHub and Google. Secrets stay on the server. */
export class OAuthService {
  private pendingStates = new Map<string, { provider: OAuthProviderId; createdAt: number }>();

  constructor(private readonly config: AppConfig, private readonly store: TokenStore) {}

  isConfigured(provider: OAuthProviderId): boolean {
    const c = provider === 'github' ? this.config.github : this.config.google;
    return Boolean(c.clientId && c.clientSecret);
  }

  status(provider: OAuthProviderId): IntegrationStatus {
    if (!this.isConfigured(provider)) return 'not_configured';
    return this.store.get(provider) ? 'connected' : 'disconnected';
  }

  token(provider: OAuthProviderId): StoredToken | null {
    return this.store.get(provider);
  }

  account(provider: OAuthProviderId): string | undefined {
    return this.store.get(provider)?.account;
  }

  private redirectUri(provider: OAuthProviderId): string {
    return `${this.config.publicUrl}/auth/${provider}/callback`;
  }

  startUrl(provider: OAuthProviderId): string {
    if (!this.isConfigured(provider)) throw new Error(`${provider} OAuth is not configured (set client id/secret in .env)`);
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, { provider, createdAt: Date.now() });
    if (provider === 'github') {
      const u = new URL('https://github.com/login/oauth/authorize');
      u.searchParams.set('client_id', this.config.github.clientId!);
      u.searchParams.set('redirect_uri', this.redirectUri('github'));
      const scopes = githubScopesFromEnv();
      if (scopes.length) u.searchParams.set('scope', scopes.join(' '));
      u.searchParams.set('state', state);
      return u.toString();
    }
    const client = this.googleClient();
    return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state });
  }

  private consumeState(state: string | undefined, provider: OAuthProviderId): void {
    const pending = state ? this.pendingStates.get(state) : undefined;
    if (!pending || pending.provider !== provider || Date.now() - pending.createdAt > 10 * 60_000) {
      throw new Error('Invalid or expired OAuth state');
    }
    this.pendingStates.delete(state!);
  }

  async handleCallback(provider: OAuthProviderId, params: { code?: string | undefined; state?: string | undefined; error?: string | undefined }): Promise<StoredToken> {
    if (params.error) throw new Error(`OAuth error from ${provider}: ${params.error}`);
    this.consumeState(params.state, provider);
    if (!params.code) throw new Error('Missing authorization code');
    const token = provider === 'github' ? await this.exchangeGithub(params.code) : await this.exchangeGoogle(params.code);
    await this.store.set(token);
    return token;
  }

  private async exchangeGithub(code: string): Promise<StoredToken> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: this.config.github.clientId, client_secret: this.config.github.clientSecret, code, redirect_uri: this.redirectUri('github') }),
    });
    const data = (await res.json()) as { access_token?: string; scope?: string; error?: string; error_description?: string };
    if (!data.access_token) throw new Error(data.error_description ?? data.error ?? 'GitHub token exchange failed');
    const me = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${data.access_token}`, 'user-agent': 'my-ai-work-agent' } });
    const user = (await me.json()) as { login?: string };
    return { provider: 'github', accessToken: data.access_token, ...(data.scope ? { scope: data.scope } : {}), ...(user.login ? { account: user.login } : {}), connectedAt: new Date().toISOString() };
  }

  private googleClient() {
    return new google.auth.OAuth2(this.config.google.clientId, this.config.google.clientSecret, this.redirectUri('google'));
  }

  private async exchangeGoogle(code: string): Promise<StoredToken> {
    const client = this.googleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new Error('Google token exchange failed');
    client.setCredentials(tokens);
    let email: string | undefined;
    try {
      const info = await client.getTokenInfo(tokens.access_token);
      email = info.email ?? undefined;
    } catch {
      /* email is informational only */
    }
    return {
      provider: 'google',
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(tokens.expiry_date ? { expiresAt: tokens.expiry_date } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      ...(email ? { account: email } : {}),
      connectedAt: new Date().toISOString(),
    };
  }

  /** Returns a Google token that is valid for at least a minute, refreshing if needed. */
  async freshGoogleToken(): Promise<StoredToken | null> {
    const stored = this.store.get('google');
    if (!stored) return null;
    if (!stored.expiresAt || stored.expiresAt - Date.now() > 60_000 || !stored.refreshToken) return stored;
    const client = this.googleClient();
    client.setCredentials({ refresh_token: stored.refreshToken });
    const { credentials } = await client.refreshAccessToken();
    const updated: StoredToken = {
      ...stored,
      accessToken: credentials.access_token ?? stored.accessToken,
      ...(credentials.expiry_date ? { expiresAt: credentials.expiry_date } : {}),
    };
    await this.store.set(updated);
    return updated;
  }

  async disconnect(provider: OAuthProviderId): Promise<void> {
    await this.store.remove(provider);
  }
}
