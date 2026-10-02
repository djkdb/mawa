import { AgentEventSchema, type AgentEvent, type AgentMode, type WeeklyWorkReport } from '@mawa/shared';

export type IntegrationStatus = 'not_configured' | 'disconnected' | 'connected';

export interface Status {
  defaultMode: AgentMode;
  llm: { provider: string; model: string; isModel: boolean };
  tokenStore: { persistent: boolean };
  integrations: {
    github: { status: IntegrationStatus; account: string | null; connectUrl: string };
    google: { status: IntegrationStatus; account: string | null; connectUrl: string; services: string[] };
  };
  realMode: { available: boolean; servers: string[]; skipped: Array<{ id: string; reason: string }> };
}

export interface RunRecord {
  runId: string;
  mode: AgentMode;
  prompt: string;
  status: 'running' | 'success' | 'error';
  createdAt: string;
  report: WeeklyWorkReport | null;
  warnings: string[];
  error?: string;
  llm: { provider: string; model: string };
}

export async function fetchStatus(): Promise<Status> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as Status;
}

export async function startRun(prompt: string, mode: AgentMode): Promise<{ runId: string; mode: AgentMode; warnings: string[] }> {
  const res = await fetch('/api/agent/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, mode }) });
  const body = (await res.json()) as { runId: string; mode: AgentMode; warnings: string[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `run failed (${res.status})`);
  return body;
}

export async function fetchRun(runId: string): Promise<RunRecord> {
  const res = await fetch(`/api/agent/runs/${runId}`);
  if (!res.ok) throw new Error(`run ${res.status}`);
  return (await res.json()) as RunRecord;
}

export async function disconnect(provider: 'github' | 'google'): Promise<void> {
  await fetch(`/auth/${provider}/disconnect`, { method: 'POST' });
}

/** Subscribes to a run's SSE stream. Events are validated against the shared schema before use. */
export function subscribeRun(runId: string, handlers: { onEvent: (e: AgentEvent) => void; onDone: (status: string) => void; onError: (msg: string) => void }): () => void {
  const es = new EventSource(`/api/agent/runs/${runId}/events`);
  const types = AgentEventSchema.options.map((o) => o.shape.type.value);
  for (const t of types) {
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
