import { AgentEventSchema, WeeklyWorkReportSchema, type AgentEvent, type AgentMode, type WeeklyWorkReport } from '@mawa/shared';
import demoRuns from '@mawa/shared/demo/demo-runs.json';
import type { AgentClient, RunRecord, RunSubscription, StartRunResult, Status } from './types.js';

export interface RecordedRun {
  id: string;
  prompt: string;
  llm: { provider: string; model: string };
  events: AgentEvent[];
  report: WeeklyWorkReport;
  warnings: string[];
}

const RECORDED = (demoRuns as unknown as { recordedAt: string; note: string; runs: RecordedRun[] });

/** The example requests the demo can answer: exactly the prompts that were recorded. */
export const DEMO_EXAMPLES = RECORDED.runs.map((r) => ({ id: r.id, prompt: r.prompt }));
export const DEMO_RECORDED_AT = RECORDED.recordedAt;

/** Pacing of the replay, in ms. Deliberately modest: it should read as execution, not theatre. */
const DELAY: Partial<Record<AgentEvent['type'], number>> = {
  agent_run_started: 250,
  tool_discovery_started: 350,
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
  private runs = new Map<string, RunRecord & { recorded: RecordedRun }>();

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
    };
  }

  async startRun(prompt: string, mode: AgentMode): Promise<StartRunResult> {
    if (mode !== 'demo') throw new Error('This deployment is a browser-only demo. Real mode needs the API server (see README → Demo vs Real).');
    const recorded = RECORDED.runs.find((r) => r.prompt.trim() === prompt.trim());
    if (!recorded) {
      throw new Error('Demo mode replays recorded MCP runs, so it can only answer the example requests above. Pick one of them, or run the API locally for free-form prompts.');
    }
    const runId = `demo_${recorded.id}_${Date.now().toString(36)}`;
    const record = { runId, mode: 'demo' as const, prompt: recorded.prompt, status: 'running' as const, createdAt: new Date().toISOString(), report: null, warnings: recorded.warnings, llm: recorded.llm, recorded };
    this.runs.set(runId, record);
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
        Object.assign(record, { status: 'success', report: record.recorded.report });
        handlers.onDone('success');
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
        handlers.onEvent({ ...event, report });
      } else {
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

  async fetchRun(runId: string): Promise<RunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error('Unknown demo run');
    const { recorded: _recorded, ...record } = r;
    return record;
  }

  async disconnect(): Promise<void> {
    /* nothing to disconnect in a browser-only demo */
  }
}
