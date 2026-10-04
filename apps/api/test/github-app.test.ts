import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthService } from '../src/auth/oauth.js';
import { TokenStore } from '../src/auth/token-store.js';
import { loadConfig, safeBaseUrl } from '../src/config.js';

describe('GitHub base URL overrides (test-only fakes)', () => {
  it('defaults to github.com and accepts https or localhost http only', () => {
    expect(safeBaseUrl(undefined, 'https://github.com', 'X')).toBe('https://github.com');
    expect(safeBaseUrl('http://localhost:3901/', 'https://github.com', 'X')).toBe('http://localhost:3901');
    expect(safeBaseUrl('https://ghe.example.com/x', 'https://github.com', 'X')).toBe('https://ghe.example.com');
    expect(() => safeBaseUrl('http://evil.example.com', 'https://github.com', 'GITHUB_API_URL')).toThrow(/GITHUB_API_URL must be https/);
  });
});

describe('GitHub App user tokens', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function service() {
    const dir = await mkdtemp(join(tmpdir(), 'mawa-ghapp-'));
    const config = loadConfig({ GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec', GITHUB_OAUTH_SCOPES: '', TOKEN_STORE_PATH: join(dir, 't.json'), AUDIT_LOG_PATH: join(dir, 'a.jsonl') });
    const store = new TokenStore(config.tokenStorePath);
    await store.load();
    return { oauth: new OAuthService(config, store), store };
  }

  it('sends no scope for a GitHub App, stores expiry + refresh token, and refreshes before it expires', async () => {
    const { oauth, store } = await service();
    const start = new URL(oauth.startUrl('github'));
    expect(start.searchParams.has('scope')).toBe(false);
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (u.endsWith('/user')) return new Response(JSON.stringify({ login: 'me' }));
      n += 1;
      // First token expires almost immediately; the refreshed one lasts 8h.
      return new Response(JSON.stringify({ access_token: `t${n}`, refresh_token: `r${n}`, expires_in: n === 1 ? 60 : 28800, scope: '' }));
    }));
    await oauth.handleCallback('github', { code: 'c', state: start.searchParams.get('state')! });
    expect(store.get('github')).toMatchObject({ accessToken: 't1', refreshToken: 'r1', account: 'me' });
    const fresh = await oauth.freshGithubToken();
    expect(fresh).toMatchObject({ accessToken: 't2', refreshToken: 'r2' });
    expect(calls.at(-1)!.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'cid' });
    // Still valid: no further request.
    await oauth.freshGithubToken();
    expect(calls.filter((c) => c.url.endsWith('/access_token'))).toHaveLength(2);
  });
});

describe('.env lines left empty', () => {
  it('treat KEY= as unset (default paths), but keep GITHUB_OAUTH_SCOPES= as "no scope"', () => {
    const c = loadConfig({ TOKEN_STORE_PATH: '', RUN_STORE_PATH: '', AUDIT_LOG_PATH: '', API_PUBLIC_URL: '', GITHUB_CLIENT_ID: '', GITHUB_OAUTH_SCOPES: '' });
    expect(c.tokenStorePath).toMatch(/\.tokens[\\/]tokens\.enc\.json$/);
    expect(c.auditLogPath).toMatch(/\.tokens[\\/]audit\.jsonl$/);
    expect(c.publicUrl).toBe('http://localhost:3001');
    expect(c.github.clientId).toBeUndefined();
    expect(c.github.scopes).toEqual([]);
  });
});
