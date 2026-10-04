import { randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { moodleToken } from '@mawa/mcp-lms';
import type { AppConfig } from '../config.js';
import type { OAuthProviderId, StoredToken, TokenStore } from './token-store.js';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'];
export { DEFAULT_GITHUB_SCOPES, githubScopesFromEnv } from './scopes.js';

export type IntegrationStatus = 'not_configured' | 'disconnected' | 'connected';

/** OAuth 2.0 authorization-code flow for GitHub and Google. Secrets stay on the server. */
export class OAuthService {
  private pendingStates = new Map<string, { provider: OAuthProviderId; createdAt: number }>();

  constructor(private readonly config: AppConfig, private readonly store: TokenStore) {}

  isConfigured(provider: OAuthProviderId): boolean {
    if (provider === 'lms') return true; // no client registration: the user's own LMS login mints a token
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
      const u = new URL('/login/oauth/authorize', this.config.github.oauthUrl);
      u.searchParams.set('client_id', this.config.github.clientId!);
      u.searchParams.set('redirect_uri', this.redirectUri('github'));
      const scopes = this.config.github.scopes;
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

  /**
   * GitHub App user tokens expire (8h) and come with a refresh token; OAuth App tokens do not.
   * Both shapes are stored; freshGithubToken() refreshes the former before a run.
   */
  private async githubTokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
    const res = await fetch(new URL('/login/oauth/access_token', this.config.github.oauthUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: this.config.github.clientId, client_secret: this.config.github.clientSecret, ...body }),
    });
    const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
    if (!data.access_token) throw new Error(data.error_description ?? data.error ?? 'GitHub token exchange failed');
    return data as { access_token: string };
  }

  private githubFields(data: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }) {
    return {
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(data.expires_in ? { expiresAt: Date.now() + data.expires_in * 1000 } : {}),
      ...(data.scope ? { scope: data.scope } : {}),
    };
  }

  private async exchangeGithub(code: string): Promise<StoredToken> {
    const data = await this.githubTokenRequest({ code, redirect_uri: this.redirectUri('github') });
    const me = await fetch(new URL('/user', this.config.github.apiUrl), { headers: { authorization: `Bearer ${data.access_token}`, 'user-agent': 'my-ai-work-agent', accept: 'application/vnd.github+json' } });
    const user = (await me.json().catch(() => ({}))) as { login?: string };
    return { provider: 'github', ...this.githubFields(data), ...(user.login ? { account: user.login } : {}), connectedAt: new Date().toISOString() };
  }

  /** Returns a GitHub token valid for at least five minutes, refreshing an expiring GitHub App token. */
  async freshGithubToken(): Promise<StoredToken | null> {
    const stored = this.store.get('github');
    if (!stored) return null;
    if (!stored.expiresAt || stored.expiresAt - Date.now() > 5 * 60_000 || !stored.refreshToken) return stored;
    const data = await this.githubTokenRequest({ grant_type: 'refresh_token', refresh_token: stored.refreshToken });
    const updated: StoredToken = { ...stored, ...this.githubFields(data) };
    await this.store.set(updated);
    return updated;
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

  /**
   * CBNU eCampus (Moodle): exchange the user's LMS id/password for a mobile web-service token, the
   * same call the official app makes. The password is used for this one request and never stored.
   */
  async connectLms(username: string, password: string, fetchImpl: typeof fetch = fetch): Promise<void> {
    const token = await moodleToken(this.config.lms.baseUrl, username, password, fetchImpl);
    await this.store.set({ provider: 'lms', accessToken: token, account: username, connectedAt: new Date().toISOString() });
  }

  /**
   * Revokes the grant at the provider (best effort), then deletes the local token.
   * `revoked` tells the UI whether the provider confirmed it.
   */
  async disconnect(provider: OAuthProviderId, fetchImpl: typeof fetch = fetch): Promise<{ revoked: boolean }> {
    const stored = this.store.get(provider);
    let revoked = false;
    if (stored) {
      try {
        if (provider === 'google') {
          const token = stored.refreshToken ?? stored.accessToken;
          const res = await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
          revoked = res.ok;
        } else if (provider === 'github' && this.config.github.clientId && this.config.github.clientSecret) {
          const basic = Buffer.from(`${this.config.github.clientId}:${this.config.github.clientSecret}`).toString('base64');
          const res = await fetchImpl(new URL(`/applications/${this.config.github.clientId}/grant`, this.config.github.apiUrl), {
            method: 'DELETE',
            headers: { authorization: `Basic ${basic}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
            body: JSON.stringify({ access_token: stored.accessToken }),
          });
          revoked = res.status === 204;
        }
      } catch {
        revoked = false;
      }
    }
    await this.store.remove(provider);
    return { revoked };
  }
}
