import { describe, expect, it } from 'vitest';
import { createApp, createDeps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TokenStore } from '../src/auth/token-store.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeApp(env: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mawa-api-'));
  const config = loadConfig({ AGENT_MODE: 'demo', LLM_PROVIDER: 'anthropic', TOKEN_STORE_PATH: join(dir, 't.json'), AUDIT_LOG_PATH: join(dir, 'audit.jsonl'), ...env });
  return createApp(await createDeps(config));
}

describe('api', () => {
  it('status reports demo defaults, scripted llm and unconfigured integrations honestly', async () => {
    const app = await makeApp();
    const res = await app.request('/api/status');
    const body = await res.json();
    expect(body.defaultMode).toBe('demo');
    expect(body.llm.provider).toBe('scripted');
    expect(body.llm.isModel).toBe(false);
    expect(body.integrations.github.status).toBe('not_configured');
    expect(body.integrations.google.status).toBe('not_configured');
    expect(body.realMode.available).toBe(false);
    expect(body.tokenStore.persistent).toBe(false);
  });

  it('refuses real mode when nothing is connected', async () => {
    const app = await makeApp();
    const res = await app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: 'hi', mode: 'real' }), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Real mode needs/);
  });

  it('runs a demo request and streams events over SSE until done', async () => {
    const app = await makeApp();
    const start = await app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: '이번 주 진행 상황 정리해줘' }), headers: { 'content-type': 'application/json' } });
    expect(start.status).toBe(202);
    const { runId, mode } = await start.json();
    expect(mode).toBe('demo');

    const sse = await app.request(`/api/agent/runs/${runId}/events`);
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    const text = await sse.text();
    const eventNames = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
    expect(eventNames[0]).toBe('agent_run_started');
    expect(eventNames).toContain('report_generated');
    expect(eventNames.at(-1)).toBe('done');
    expect(text).toContain('"mode":"demo"');

    const run = await (await app.request(`/api/agent/runs/${runId}`)).json();
    expect(run.status).toBe('success');
    expect(run.report.sections.length).toBe(7);
  }, 30_000);

  it('appends each finished run to a hash-chained audit file and serves it with the check', async () => {
    const app = await makeApp();
    const start = await app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: '이번 주 진행 상황 정리해줘' }), headers: { 'content-type': 'application/json' } });
    const { runId } = await start.json();
    await (await app.request(`/api/agent/runs/${runId}/events`)).text();
    const audit = await (await app.request('/api/audit')).json();
    expect(audit.source).toBe('server');
    expect(audit.check).toMatchObject({ ok: true, signature: 'valid' });
    expect(typeof audit.publicKey).toBe('string');
    expect(audit.entries.every((e: { sig?: string }) => typeof e.sig === 'string')).toBe(true);
    expect(audit.entries.length).toBeGreaterThan(3);
    expect(audit.entries.every((e: { runId: string }) => e.runId === runId)).toBe(true);
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(['read', 'llm']));
    expect(audit.entries[0].prev).toBe('0'.repeat(64));
  }, 30_000);

  it('owns the policy: a request may tighten it but not loosen it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mawa-pol-'));
    const policyPath = join(dir, 'policy.json');
    await writeFile(policyPath, JSON.stringify({ allowedTools: ['github__get_open_issues', 'gmail__search_project_emails'], exclude: ['엄마'], maskEmails: true, maskPii: true }));
    const app = await makeApp({ POLICY_PATH: policyPath });
    const status = await (await app.request('/api/status')).json();
    expect(status.policy).toMatchObject({ source: 'file', base: { exclude: ['엄마'], maskPii: true } });
    const post = (policy: unknown) => app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: 'x', policy }), headers: { 'content-type': 'application/json' } });
    const loosen = await post({ maskEmails: false, allowedTools: ['github__get_open_issues', 'gmail__get_email'] });
    expect(loosen.status).toBe(403);
    expect((await loosen.json()).refused).toEqual(['allowedTools: gmail__get_email', 'maskEmails']);
    const tighten = await post({ allowedTools: ['github__get_open_issues'], exclude: ['쿠폰'] });
    expect(tighten.status).toBe(202);
    const { runId } = await tighten.json();
    const sse = await (await app.request(`/api/agent/runs/${runId}/events`)).text();
    const applied = JSON.parse(sse.split('\n').find((l) => l.startsWith('data:') && l.includes('"policy_applied"'))!.slice(5));
    expect(applied.policy).toMatchObject({ allowedTools: ['github__get_open_issues'], exclude: ['엄마', '쿠폰'], maskEmails: true });
  }, 30_000);

  it('oauth start returns 400 when the provider is not configured', async () => {
    const app = await makeApp();
    const res = await app.request('/auth/github/start');
    expect(res.status).toBe(400);
  });
});

describe('TokenStore', () => {
  it('round-trips encrypted tokens through disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mawa-ts-'));
    const key = 'a'.repeat(64);
    const path = join(dir, 'tokens.json');
    const a = new TokenStore(path, key);
    await a.set({ provider: 'github', accessToken: 'secret-token', connectedAt: 'now' });
    const raw = await (await import('node:fs/promises')).readFile(path, 'utf8');
    expect(raw).not.toContain('secret-token');
    const b = new TokenStore(path, key);
    await b.load();
    expect(b.get('github')?.accessToken).toBe('secret-token');
  });

  it('rejects a malformed key', () => {
    expect(() => new TokenStore('/tmp/x', 'short')).toThrow(/64 hex/);
  });
});

describe('real mode integrity', () => {
  it('spawns only the connected server in --mode=real and never yields demo fixture ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mawa-real-'));
    const config = loadConfig({ AGENT_MODE: 'demo', LLM_PROVIDER: 'anthropic', TOKEN_STORE_PATH: join(dir, 't.json'), AUDIT_LOG_PATH: join(dir, 'audit.jsonl'), GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
    const deps = await createDeps(config);
    // Simulate a completed OAuth connection with a token that cannot read anything.
    await deps.store.set({ provider: 'github', accessToken: 'invalid-token-for-test', connectedAt: 'now', account: 'tester' });
    const app = createApp(deps);

    const status = await (await app.request('/api/status')).json();
    expect(status.integrations.github.status).toBe('connected');
    expect(status.realMode.servers).toEqual(['github']);
    expect(status.realMode.skipped.map((s: { id: string }) => s.id)).toEqual(['gmail', 'calendar', 'lms']);
    expect(JSON.stringify(status)).not.toContain('invalid-token-for-test');

    const start = await app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: 'x', mode: 'real' }), headers: { 'content-type': 'application/json' } });
    expect(start.status).toBe(202);
    const { runId } = await start.json();
    const text = await (await app.request(`/api/agent/runs/${runId}/events`)).text();
    expect(text).toContain('"mode":"real"');
    expect(text).not.toContain('"mode":"demo"');
    expect(text).not.toContain('demo-user');
    expect(text).not.toContain('invalid-token-for-test');
    const discoveryLine = text.split('\n').find((l) => l.startsWith('data: ') && l.includes('"tool_discovery_started"'))!;
    expect(JSON.parse(discoveryLine.slice(6)).servers).toEqual(['github']);
  }, 60_000);
});

describe('api hardening', () => {
  it('refuses cross-origin state changes and run reads, allows the web origin', async () => {
    const app = await makeApp();
    const evil = { origin: 'https://evil.example', 'content-type': 'application/json' };
    expect((await app.request('/auth/github/disconnect', { method: 'POST', headers: evil })).status).toBe(403);
    expect((await app.request('/api/agent/run', { method: 'POST', body: JSON.stringify({ prompt: 'x' }), headers: evil })).status).toBe(403);
    expect((await app.request('/api/agent/runs', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await app.request('/api/status', { headers: { origin: 'http://localhost:5173' } })).status).toBe(200);
  });

  it('binds to loopback by default and reports requested scopes', async () => {
    expect(loadConfig({}).host).toBe('127.0.0.1');
    const app = await makeApp();
    const body = await (await app.request('/api/status')).json();
    expect(body.integrations.github.scopes).toEqual(['read:user', 'repo']);
    expect(body.integrations.google.scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
  });
});

describe('oauth disconnect', () => {
  it('revokes the grant at the provider before deleting the local token', async () => {
    const { OAuthService } = await import('../src/auth/oauth.js');
    const dir = await mkdtemp(join(tmpdir(), 'mawa-oauth-'));
    const config = loadConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', TOKEN_STORE_PATH: join(dir, 't.json') });
    const store = new TokenStore(config.tokenStorePath);
    await store.set({ provider: 'google', accessToken: 'at', refreshToken: 'rt', connectedAt: new Date().toISOString() } as never);
    const oauth = new OAuthService(config, store);
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => { calls.push(`${url} ${String(init?.body)}`); return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    expect(await oauth.disconnect('google', fakeFetch)).toEqual({ revoked: true });
    expect(calls[0]).toContain('https://oauth2.googleapis.com/revoke token=rt');
    expect(store.get('google')).toBeNull();
  });
});

describe('api access token', () => {
  it('requires the token on /api/* when API_ACCESS_TOKEN is set; health stays open', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mawa-tok-'));
    const config = loadConfig({ AGENT_MODE: 'demo', API_ACCESS_TOKEN: 'a-long-enough-secret', TOKEN_STORE_PATH: join(dir, 't.json'), AUDIT_LOG_PATH: join(dir, 'audit.jsonl') });
    const app = createApp(await createDeps(config));
    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/api/status')).status).toBe(401);
    expect((await app.request('/api/status', { headers: { authorization: 'Bearer wrong-but-long-secret' } })).status).toBe(401);
    const ok = await app.request('/api/status', { headers: { authorization: 'Bearer a-long-enough-secret' } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).api.tokenRequired).toBe(true);
    expect((await app.request('/auth/google/disconnect', { method: 'POST' })).status).toBe(401);
  });
});

describe('encrypted run history', () => {
  it('persists finished runs encrypted and reloads them after a restart', async () => {
    const { EncryptedRunStore } = await import('../src/agent/encrypted-run-store.js');
    const { readFile } = await import('node:fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'mawa-runs-'));
    const path = join(dir, 'runs.enc.json');
    const key = 'ab'.repeat(32);
    const a = new EncryptedRunStore(path, key);
    await a.create({ runId: 'run_1', mode: 'demo', prompt: 'p', status: 'running', createdAt: new Date().toISOString(), events: [], report: null, warnings: [], llm: { provider: 'scripted', model: 'x' } });
    await a.update('run_1', { status: 'success', warnings: ['secret-ish minji@example.com'] });
    expect(await readFile(path, 'utf8')).not.toContain('minji');
    const b = new EncryptedRunStore(path, key);
    await b.load();
    expect((await b.get('run_1'))?.warnings).toEqual(['secret-ish minji@example.com']);
  });
});

describe('eCampus (Moodle) connection', () => {
  it('exchanges id/password for a token once, stores only the token, and exposes the status', async () => {
    const { OAuthService } = await import('../src/auth/oauth.js');
    const dir = await mkdtemp(join(tmpdir(), 'mawa-lms-'));
    const config = loadConfig({ TOKEN_STORE_PATH: join(dir, 't.json') });
    const store = new TokenStore(config.tokenStorePath);
    const oauth = new OAuthService(config, store);
    expect(oauth.status('lms')).toBe('disconnected');
    const seen: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => { seen.push(`${url} ${String(init?.body)}`); return new Response(JSON.stringify({ token: 'moodle-token' })); }) as unknown as typeof fetch;
    await oauth.connectLms('2021000000', 'pw-secret', fake);
    expect(seen[0]).toContain('https://lms.chungbuk.ac.kr/login/token.php');
    expect(seen[0]).toContain('service=moodle_mobile_app');
    expect(store.get('lms')).toMatchObject({ accessToken: 'moodle-token', account: '2021000000' });
    expect(JSON.stringify(store.get('lms'))).not.toContain('pw-secret');
    expect(oauth.status('lms')).toBe('connected');
    expect(await oauth.disconnect('lms', fake)).toEqual({ revoked: false });
    expect(oauth.status('lms')).toBe('disconnected');
  });

  it('refuses non-JSON connect requests (no cross-site form posts)', async () => {
    const app = await makeApp();
    const res = await app.request('/auth/lms/connect', { method: 'POST', body: 'username=a&password=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(res.status).toBe(415);
  });
});
