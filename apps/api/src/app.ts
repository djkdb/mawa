import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { AgentModeSchema, PROJECT } from '@mawa/shared';
import { GOOGLE_SCOPES, OAuthService, githubScopesFromEnv } from './auth/oauth.js';
import { TokenStore } from './auth/token-store.js';
import type { AppConfig } from './config.js';
import { MemoryRunStore, type RunStore } from '@mawa/agent-core';
import { EncryptedRunStore } from './agent/encrypted-run-store.js';
import { RunManager } from './agent/run-manager.js';

export interface AppDeps {
  config: AppConfig;
  oauth: OAuthService;
  runs: RunManager;
  store: TokenStore;
}

export async function createDeps(config: AppConfig): Promise<AppDeps> {
  const store = new TokenStore(config.tokenStorePath, config.encryptionKey);
  await store.load();
  const oauth = new OAuthService(config, store);
  // With an encryption key, run history persists (encrypted) so reports can be compared week to week.
  let runStore: RunStore = new MemoryRunStore();
  if (config.encryptionKey) {
    const encrypted = new EncryptedRunStore(config.runStorePath, config.encryptionKey);
    await encrypted.load();
    runStore = encrypted;
  }
  const runs = new RunManager(config, oauth, runStore);
  return { config, oauth, runs, store };
}

const RunBody = z.object({ prompt: z.string().trim().min(1).max(2000), mode: AgentModeSchema.optional() });

export function createApp(deps: AppDeps) {
  const { config, oauth, runs } = deps;
  const app = new Hono();
  app.use('/api/*', cors({ origin: config.webOrigin }));

  // Cross-site requests may not change state or read run data: a browser on another origin
  // could otherwise POST a form (disconnect, start runs) or read SSE. Requests without an
  // Origin header (same-origin GET, curl on the loopback interface) are allowed.
  // While bound to loopback, local dev servers on any port (vite dev/preview proxies) are trusted too.
  const allowedOrigins = new Set([config.webOrigin, new URL(config.publicUrl).origin]);
  const loopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const allowed = (o: string) => allowedOrigins.has(o) || (config.host === '127.0.0.1' && loopback.test(o));
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    const site = c.req.header('sec-fetch-site');
    if ((origin && !allowed(origin)) || (site === 'cross-site' && !(origin && allowed(origin)))) {
      if (c.req.method !== 'GET' || c.req.path.startsWith('/api/agent/')) return c.json({ error: 'Cross-origin request refused' }, 403);
    }
    await next();
  });

  // Optional access token: required for everything that reads run data or changes state.
  if (config.accessToken) {
    const expected = Buffer.from(config.accessToken);
    const ok = (given: string | undefined) => {
      if (!given) return false;
      const b = Buffer.from(given);
      return b.length === expected.length && timingSafeEqual(b, expected);
    };
    const guard = async (c: Context, next: Next) => {
      if (c.req.path === '/api/health') return next();
      const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
      const query = c.req.method === 'GET' && c.req.path.endsWith('/events') ? c.req.query('access_token') : undefined;
      if (!ok(bearer) && !ok(query)) return c.json({ error: 'API access token required' }, 401);
      return next();
    };
    app.use('/api/*', guard);
    app.use('/auth/:provider/disconnect', guard);
  }

  app.get('/api/health', (c) => c.json({ ok: true, name: PROJECT.name }));

  /** Honest capability report: what is configured, what is connected, what the LLM is. */
  app.get('/api/status', async (c) => {
    const real = await runs.availableServers('real');
    return c.json({
      defaultMode: config.defaultMode,
      llm: { ...runs.llmInfo, isModel: runs.llmInfo.provider !== 'scripted' },
      tokenStore: { persistent: deps.store.persistent },
      runStore: { persistent: deps.runs.store instanceof EncryptedRunStore },
      api: { host: config.host, tokenRequired: Boolean(config.accessToken) },
      integrations: {
        github: { status: oauth.status('github'), account: oauth.account('github') ?? null, connectUrl: '/auth/github/start', scopes: githubScopesFromEnv() },
        google: { status: oauth.status('google'), account: oauth.account('google') ?? null, connectUrl: '/auth/google/start', services: ['gmail', 'calendar'], scopes: GOOGLE_SCOPES },
      },
      realMode: { available: real.servers.length > 0, servers: real.servers.map((s) => s.id), skipped: real.skipped },
    });
  });

  app.post('/api/agent/run', async (c) => {
    const parsed = RunBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    try {
      const record = await runs.start({ prompt: parsed.data.prompt, mode: parsed.data.mode ?? config.defaultMode });
      return c.json({ runId: record.runId, mode: record.mode, llm: record.llm, warnings: record.warnings }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/agent/runs', async (c) => {
    const list = await runs.store.list(20);
    return c.json(list.map(({ events, report, ...rest }) => ({
      ...rest,
      toolCalls: events.filter((e) => e.type === 'tool_call_completed').length,
      sources: report?.sources.length ?? 0,
      servers: [...new Set(events.flatMap((e) => (e.type === 'tool_call_completed' ? [e.call.server] : [])))],
    })));
  });

  app.get('/api/agent/runs/:id', async (c) => {
    const record = await runs.store.get(c.req.param('id'));
    return record ? c.json(record) : c.json({ error: 'Run not found' }, 404);
  });

  /** Replays stored events, then streams live ones until the run finishes. */
  app.get('/api/agent/runs/:id/events', async (c) => {
    const runId = c.req.param('id');
    const record = await runs.store.get(runId);
    if (!record) return c.json({ error: 'Run not found' }, 404);
    return streamSSE(c, async (stream) => {
      let seq = 0;
      for (const e of record.events) await stream.writeSSE({ event: e.type, data: JSON.stringify(e), id: String(seq++) });
      if (record.status !== 'running') {
        await stream.writeSSE({ event: 'done', data: JSON.stringify({ status: record.status }) });
        return;
      }
      await new Promise<void>((resolve) => {
        const unsubscribe = runs.subscribe(
          runId,
          (e) => void stream.writeSSE({ event: e.type, data: JSON.stringify(e), id: String(seq++) }),
          () => {
            void runs.store.get(runId).then((r) => stream.writeSSE({ event: 'done', data: JSON.stringify({ status: r?.status ?? 'error' }) })).finally(resolve);
          },
        );
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    });
  });

  // ---- OAuth ------------------------------------------------------------
  const ProviderParam = z.enum(['github', 'google']);

  app.get('/auth/:provider/start', (c) => {
    const p = ProviderParam.safeParse(c.req.param('provider'));
    if (!p.success) return c.json({ error: 'Unknown provider' }, 404);
    try {
      return c.redirect(oauth.startUrl(p.data));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/auth/:provider/callback', async (c) => {
    const p = ProviderParam.safeParse(c.req.param('provider'));
    if (!p.success) return c.json({ error: 'Unknown provider' }, 404);
    try {
      await oauth.handleCallback(p.data, { code: c.req.query('code'), state: c.req.query('state'), error: c.req.query('error') });
      return c.redirect(`${config.webOrigin}/?connected=${p.data}`);
    } catch (err) {
      // Do not reflect provider/exception text into the URL; the detail goes to the server log.
      console.error(`[auth] ${p.data} callback failed: ${err instanceof Error ? err.message : String(err)}`);
      return c.redirect(`${config.webOrigin}/?auth_error=${p.data}`);
    }
  });

  app.post('/auth/:provider/disconnect', async (c) => {
    const p = ProviderParam.safeParse(c.req.param('provider'));
    if (!p.success) return c.json({ error: 'Unknown provider' }, 404);
    const { revoked } = await oauth.disconnect(p.data);
    return c.json({ ok: true, revoked });
  });

  return app;
}
