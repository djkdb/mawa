import { AgentEventSchema, type AgentMode, type DataPolicy } from '@mawa/shared';
import type { AgentClient, RunRecord, RunSubscription, RunSummary, StartRunResult, Status } from './types.js';

const TOKEN_KEY = 'mawa.apiToken';
/** The API access token the user entered (only needed when the API sets API_ACCESS_TOKEN). */
export function getApiToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
const POLICY_KEY = 'mawa.policy';
/** The data policy the user set on the settings page; sent with every run. */
export function getPolicy(): Partial<DataPolicy> | null { try { const v = localStorage.getItem(POLICY_KEY); return v ? (JSON.parse(v) as Partial<DataPolicy>) : null; } catch { return null; } }
export function setPolicy(p: Partial<DataPolicy> | null) { try { if (p) localStorage.setItem(POLICY_KEY, JSON.stringify(p)); else localStorage.removeItem(POLICY_KEY); } catch { /* storage unavailable */ } }
export function setApiToken(t: string | null) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } }

/** fetch with the access token, when one is set. */
function api(url: string, init: RequestInit = {}): Promise<Response> {
  const t = getApiToken();
  return fetch(url, t ? { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${t}` } } : init);
}

/** Talks to apps/api on the same origin (dev/preview proxy) or VITE_API_URL. */
export class HttpClient implements AgentClient {
  readonly kind = 'http' as const;
  constructor(private readonly base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '') {}

  async getStatus(): Promise<Status> {
    const res = await api(`${this.base}/api/status`);
    if (res.status === 401) throw new Error('401: API 접근 토큰이 필요합니다');
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as Status;
  }

  async startRun(prompt: string, mode: AgentMode): Promise<StartRunResult> {
    const res = await api(`${this.base}/api/agent/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, mode, ...(getPolicy() ? { policy: getPolicy() } : {}) }) });
    const body = (await res.json()) as StartRunResult & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `run failed (${res.status})`);
    return body;
  }

  async fetchRun(runId: string): Promise<RunRecord> {
    const res = await api(`${this.base}/api/agent/runs/${runId}`);
    if (!res.ok) throw new Error(`run ${res.status}`);
    return (await res.json()) as RunRecord;
  }

  async listRuns(): Promise<RunSummary[]> {
    const res = await api(`${this.base}/api/agent/runs`);
    if (!res.ok) throw new Error(`runs ${res.status}`);
    const rows = (await res.json()) as Array<Omit<RunRecord, 'events' | 'report'> & { toolCalls?: number; sources?: number; servers?: RunSummary['servers'] }>;
    return rows.map((r) => ({ runId: r.runId, mode: r.mode, prompt: r.prompt, status: r.status, createdAt: r.createdAt, toolCalls: r.toolCalls ?? 0, sources: r.sources ?? 0, servers: r.servers ?? [], recorded: false }));
  }

  async disconnect(provider: 'github' | 'google'): Promise<void> {
    await api(`${this.base}/auth/${provider}/disconnect`, { method: 'POST' });
  }

  /** Subscribes to the run's SSE stream; every event is validated against the shared schema. */
  subscribeRun(runId: string, handlers: RunSubscription): () => void {
    const t = getApiToken();
    const es = new EventSource(`${this.base}/api/agent/runs/${runId}/events${t ? `?access_token=${encodeURIComponent(t)}` : ''}`);
    for (const t of AgentEventSchema.options.map((o) => o.shape.type.value)) {
      es.addEventListener(t, (ev) => {
        const parsed = AgentEventSchema.safeParse(JSON.parse((ev as MessageEvent).data));
        if (parsed.success) handlers.onEvent(parsed.data);
        else handlers.onError(`Invalid event: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
      });
    }
    es.addEventListener('done', (ev) => {
      handlers.onDone((JSON.parse((ev as MessageEvent).data) as { status: string }).status);
      es.close();
    });
    es.onerror = () => {
      handlers.onError('Connection to the agent stream was lost.');
      es.close();
    };
    return () => es.close();
  }
}
