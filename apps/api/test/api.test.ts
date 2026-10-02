import { describe, expect, it } from 'vitest';
import { createApp, createDeps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TokenStore } from '../src/auth/token-store.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeApp() {
  const dir = await mkdtemp(join(tmpdir(), 'mawa-api-'));
  const config = loadConfig({ AGENT_MODE: 'demo', LLM_PROVIDER: 'anthropic', TOKEN_STORE_PATH: join(dir, 't.json') });
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
