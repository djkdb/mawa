import { AgentEventSchema, WeeklyWorkReportSchema, type AgentEvent, type AgentMode, type McpServerId, type WeeklyWorkReport } from '@mawa/shared';
import demoRuns from '@mawa/shared/demo/demo-runs.json';
import demoAudit from '@mawa/shared/demo/demo-audit.json';
import { persona } from './persona.js';
import type { AgentClient, RunRecord, RunSubscription, RunSummary, StartRunResult, Status, AuditLog } from './types.js';

export interface RecordedRun {
  id: string;
  prompt: string;
  llm: { provider: string; model: string };
  events: AgentEvent[];
  report: WeeklyWorkReport;
  warnings: string[];
  /** "validation": a fault-injection recording that shows the source validator at work. Never offered as an example. */
  kind?: 'validation' | 'llm' | 'policy';
  note?: string;
  persona?: 'student' | 'worker';
  /** For the policy demo: the recording of the same question without the policy, and a short label. */
  baseline?: string;
  policyLabel?: string;
}

const RECORDED = (demoRuns as unknown as { recordedAt: string; note: string; policy?: { exclude: string[]; maskEmails: boolean; maskPii?: boolean }; runs: RecordedRun[] });
/** The data policy the demo recordings ran under. */
export const DEMO_POLICY = RECORDED.policy ?? { exclude: [], maskEmails: true };

/** MCP servers a run called, in first-call order. */
export function serversOf(events: AgentEvent[]): McpServerId[] {
  const out: McpServerId[] = [];
  for (const e of events) if (e.type === 'tool_call_completed' && !out.includes(e.call.server)) out.push(e.call.server);
  return out;
}

/** `recorded_<id>` and session replays `demo_<id>_<stamp>` both map back to a shipped recording. */
export function recordedIdOf(runId: string): string | null {
  const m = runId.match(/^recorded_(.+)$/) ?? runId.match(/^demo_(.+)_[a-z0-9]+$/);
  return m ? m[1]! : null;
}

/** A finished recorded run, for showing a completed result on first paint (no replay, no timers). */
export function getRecordedRun(id?: string): RecordedRun | null {
  return (id ? RECORDED.runs.find((r) => r.id === id) : RECORDED.runs.find((r) => r.id === persona().defaultRun) ?? RECORDED.runs.find((r) => !r.kind)) ?? null;
}
const personaOf = (r: RecordedRun) => r.persona ?? 'student';
/** The example questions of a persona's data. */
export function demoExamples(): Array<{ id: string; prompt: string }> {
  return RECORDED.runs.filter((r) => !r.kind && personaOf(r) === persona().data).map((r) => ({ id: r.id, prompt: r.prompt }));
}
/** The example (any persona) a prompt was recorded for. */
export function exampleOf(prompt: string | null | undefined): { id: string; prompt: string } | null {
  const r = prompt ? RECORDED.runs.find((x) => !x.kind && x.prompt === prompt) : undefined;
  return r ? { id: r.id, prompt: r.prompt } : null;
}
/** Which persona's data a recorded run belongs to. */
export function recordedPersona(id: string): 'student' | 'worker' | null {
  const r = RECORDED.runs.find((x) => x.id === id);
  return r ? personaOf(r) : null;
}

/** The example requests the demo can answer: exactly the prompts that were recorded. */
/** The student persona's example questions (the default). */
export const DEMO_EXAMPLES = RECORDED.runs.filter((r) => !r.kind && personaOf(r) === 'student').map((r) => ({ id: r.id, prompt: r.prompt }));

/** Replays started in this browser, remembered across reloads (ids and times only; the content is the recording). */
const STORE_KEY = 'mawa.demo.runs';
type Remembered = { runId: string; id: string; createdAt: string };
function loadRemembered(): Remembered[] {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as unknown; return Array.isArray(v) ? (v as Remembered[]).slice(0, 30) : []; } catch { return []; }
}
function remember(r: Remembered) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([r, ...loadRemembered().filter((x) => x.runId !== r.runId)].slice(0, 30))); } catch { /* storage unavailable: history stays in memory */ }
}
export const DEMO_RECORDED_AT = RECORDED.recordedAt;

/** Pacing of the replay, in ms. Deliberately modest: it should read as execution, not theatre. */
const DELAY: Partial<Record<AgentEvent['type'], number>> = {
  agent_run_started: 250,
  tool_discovery_started: 350,
  mcp_server_connected: 220,
  mcp_message: 70,
  llm_request: 300,
  llm_response: 450,
  policy_applied: 300,
  tool_discovered: 450,
  tool_call_started: 180,
  tool_call_completed: 320,
  tool_call_failed: 320,
  context_aggregated: 500,
  report_generated: 900,
  agent_run_completed: 200,
};

/**
 * Browser-only replay of runs recorded from the real pipeline (scripted
 * provider + real MCP servers in demo mode). It performs no network requests:
 * no /api, no EventSource, no OAuth. Every event it emits is the recorded
 * event, re-stamped with a fresh runId and timestamp and validated against
 * the shared schema, so the UI code path is identical to a live run.
 */
export class DemoClient implements AgentClient {
  readonly kind = 'demo' as const;
  private runs = new Map<string, RunRecord & { recorded: RecordedRun; events: AgentEvent[] }>();

  async getStatus(): Promise<Status> {
    const first = RECORDED.runs[0];
    return {
      defaultMode: 'demo',
      llm: { ...(first?.llm ?? { provider: 'scripted', model: 'scripted-heuristics-v1' }), isModel: false },
      tokenStore: { persistent: false },
      integrations: {
        github: { status: 'not_configured', account: null, connectUrl: '' },
        google: { status: 'not_configured', account: null, connectUrl: '', services: ['gmail', 'calendar'] },
      },
      realMode: { available: false, servers: [], skipped: [{ id: 'github', reason: 'Browser-only demo: no API deployed' }, { id: 'gmail', reason: 'Browser-only demo: no API deployed' }, { id: 'calendar', reason: 'Browser-only demo: no API deployed' }] },
      policy: { base: { maskPii: true, pseudonymize: false, ...DEMO_POLICY }, source: 'recorded' },
    };
  }

  /** The audit chain written once when the demo was recorded (scripts/export-portfolio-data.mjs). */
  async getAudit(): Promise<AuditLog> {
    return { source: 'recorded', entries: (demoAudit as unknown as { entries: AuditLog['entries'] }).entries };
  }

  async startRun(prompt: string, mode: AgentMode): Promise<StartRunResult> {
    if (mode !== 'demo') throw new Error('This deployment is a browser-only demo. Real mode needs the API server (see README → Demo vs Real).');
    const recorded = RECORDED.runs.find((r) => !r.kind && r.prompt.trim() === prompt.trim());
    if (!recorded) {
      throw new Error('Demo mode replays recorded MCP runs, so it can only answer the example requests above. Pick one of them, or run the API locally for free-form prompts.');
    }
    const runId = `demo_${recorded.id}_${Date.now().toString(36)}`;
    const record = { runId, mode: 'demo' as const, prompt: recorded.prompt, status: 'running' as const, createdAt: new Date().toISOString(), report: null, warnings: recorded.warnings, llm: recorded.llm, recorded, events: [] as AgentEvent[] };
    this.runs.set(runId, record);
    remember({ runId, id: recorded.id, createdAt: record.createdAt });
    return { runId, mode: 'demo', warnings: recorded.warnings };
  }

  subscribeRun(runId: string, handlers: RunSubscription): () => void {
    const record = this.runs.get(runId);
    if (!record) {
      handlers.onError('Unknown demo run');
      return () => undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const events = record.recorded.events;
    const base = Date.now();
    const originalBase = new Date(events[0]?.timestamp ?? base).getTime();

    const step = (i: number) => {
      if (cancelled) return;
      if (i >= events.length) {
        handlers.onDone(record.status === 'running' ? 'success' : record.status);
        return;
      }
      const src = events[i]!;
      // Re-stamp identity and clock; the payload is the recorded one.
      const restamped = { ...src, runId, timestamp: new Date(base + (new Date(src.timestamp).getTime() - originalBase)).toISOString() };
      const parsed = AgentEventSchema.safeParse(restamped);
      if (!parsed.success) {
        handlers.onError(`Recorded event failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
        return;
      }
      const event = parsed.data;
      if (event.type === 'report_generated') {
        const report = WeeklyWorkReportSchema.parse({ ...event.report, runId });
        Object.assign(record, { report });
        record.events.push({ ...event, report });
        handlers.onEvent({ ...event, report });
      } else {
        // The record is final the moment the completion event goes out, so history never shows a stale "running".
        if (event.type === 'agent_run_completed') Object.assign(record, { status: event.status === 'success' ? 'success' : 'error', report: record.recorded.report });
        record.events.push(event);
        handlers.onEvent(event);
      }
      timer = setTimeout(() => step(i + 1), DELAY[event.type] ?? 250);
    };
    timer = setTimeout(() => step(0), 300);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  /** Session runs (newest first) followed by the shipped recordings, so the history is never empty. */
  async listRuns(): Promise<RunSummary[]> {
    const session: RunSummary[] = [...this.runs.values()].reverse().map((r) => ({
      runId: r.runId, mode: 'demo', prompt: r.prompt, status: r.status, createdAt: r.createdAt,
      toolCalls: r.recorded.events.filter((e) => e.type === 'tool_call_completed').length, sources: r.recorded.report.sources.length, servers: serversOf(r.recorded.events), recorded: false,
    }));
    const earlier: RunSummary[] = loadRemembered().filter((m) => !this.runs.has(m.runId)).flatMap((m) => {
      const r = RECORDED.runs.find((x) => x.id === m.id);
      return r ? [{ runId: m.runId, mode: 'demo' as const, prompt: r.prompt, status: 'success' as const, createdAt: m.createdAt, toolCalls: r.events.filter((e) => e.type === 'tool_call_completed').length, sources: r.report.sources.length, servers: serversOf(r.events), recorded: false }] : [];
    });
    const shipped: RunSummary[] = RECORDED.runs.map((r) => ({
      runId: `recorded_${r.id}`, mode: 'demo', prompt: r.prompt, status: 'success', createdAt: r.report.generatedAt,
      toolCalls: r.events.filter((e) => e.type === 'tool_call_completed').length, sources: r.report.sources.length, servers: serversOf(r.events), recorded: true,
      ...(r.kind ? { kind: r.kind } : {}), ...(r.kind === 'llm' ? { model: r.llm.model } : {}),
    }));
    return [...session, ...earlier, ...shipped];
  }

  async fetchRun(runId: string): Promise<RunRecord> {
    const live = this.runs.get(runId);
    if (live) {
      const { recorded: _recorded, ...record } = live;
      return record;
    }
    // Shipped recording, or a session replay after a page reload: both resolve to the recording itself.
    const id = recordedIdOf(runId);
    const r = id ? RECORDED.runs.find((x) => x.id === id) : undefined;
    if (!r) throw new Error('이 실행 기록을 찾을 수 없습니다.');
    // A replay from an earlier visit keeps its own id and time; its content is the recording.
    const earlier = loadRemembered().find((m) => m.runId === runId);
    if (earlier) return { runId, mode: 'demo', prompt: r.prompt, status: 'success', createdAt: earlier.createdAt, report: { ...r.report, runId }, warnings: r.warnings, llm: r.llm, events: r.events };
    return { runId: `recorded_${r.id}`, mode: 'demo', prompt: r.prompt, status: 'success', createdAt: r.report.generatedAt, report: r.report, warnings: r.warnings, llm: r.llm, events: r.events, ...(r.note ? { note: r.note } : {}) };
  }

  async disconnect(): Promise<void> {
    /* nothing to disconnect in a browser-only demo */
  }
}
