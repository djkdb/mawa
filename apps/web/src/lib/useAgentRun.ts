import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentMode, WeeklyWorkReport } from '@mawa/shared';
import { getClient, getRecordedRun } from './client.js';

/** Coarse phases shown in the stepper; derived from the event stream, never from a fake percentage. */
export type RunPhase = 'idle' | 'starting' | 'discovering' | 'running' | 'aggregating' | 'analyzing' | 'report' | 'completed' | 'error';

export const PHASE_ORDER: RunPhase[] = ['starting', 'discovering', 'running', 'aggregating', 'analyzing', 'report', 'completed'];

export interface AgentRunState {
  phase: RunPhase;
  runId: string | null;
  mode: AgentMode | null;
  events: AgentEvent[];
  report: WeeklyWorkReport | null;
  warnings: string[];
  error: string | null;
}

const initial: AgentRunState = { phase: 'idle', runId: null, mode: null, events: [], report: null, warnings: [], error: null };

export function phaseFromEvent(type: AgentEvent['type'], prev: RunPhase): RunPhase {
  switch (type) {
    case 'agent_run_started':
      return 'starting';
    case 'tool_discovery_started':
    case 'tool_discovered':
      return 'discovering';
    case 'tool_call_started':
    case 'tool_call_completed':
    case 'tool_call_failed':
      return 'running';
    case 'context_aggregated':
      return 'analyzing';
    case 'report_generated':
      return 'report';
    case 'agent_run_completed':
      return prev === 'error' ? 'error' : 'completed';
  }
}

export function useAgentRun() {
  const [state, setState] = useState<AgentRunState>(initial);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const run = useCallback(async (prompt: string, mode: AgentMode) => {
    const client = getClient();
    unsubscribe.current?.();
    setState({ ...initial, phase: 'starting', mode });
    try {
      const started = await client.startRun(prompt, mode);
      setState((s) => ({ ...s, runId: started.runId, mode: started.mode, warnings: started.warnings }));
      unsubscribe.current = client.subscribeRun(started.runId, {
        onEvent: (e) =>
          setState((s) => ({
            ...s,
            events: [...s.events, e],
            phase: e.type === 'agent_run_completed' && e.status === 'error' ? 'error' : phaseFromEvent(e.type, s.phase),
            report: e.type === 'report_generated' ? e.report : s.report,
            error: e.type === 'agent_run_completed' && e.status === 'error' ? (e.error ?? 'Run failed') : s.error,
          })),
        onDone: async (status) => {
          const record = await client.fetchRun(started.runId).catch(() => null);
          setState((s) => ({
            ...s,
            phase: status === 'success' ? 'completed' : 'error',
            report: record?.report ?? s.report,
            warnings: record?.warnings ?? s.warnings,
            error: record?.error ?? s.error,
          }));
        },
        onError: (msg) => setState((s) => (s.phase === 'completed' || s.phase === 'error' ? s : { ...s, phase: 'error', error: msg })),
      });
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  /** Demo build only: show a recorded run as already completed (first paint), without replaying it. */
  const showRecorded = useCallback((id?: string) => {
    const r = getRecordedRun(id);
    if (!r) return;
    unsubscribe.current?.();
    setState({ phase: 'completed', runId: `recorded_${r.id}`, mode: 'demo', events: r.events, report: r.report, warnings: r.warnings, error: null });
  }, []);

  /** Open a finished run from history (any client). */
  const openRun = useCallback(async (runId: string) => {
    const r = await getClient().fetchRun(runId);
    unsubscribe.current?.();
    setState({ phase: r.status === 'success' ? 'completed' : 'error', runId: r.runId, mode: r.mode, events: [], report: r.report, warnings: r.warnings, error: r.error ?? null });
  }, []);

  const reset = useCallback(() => {
    unsubscribe.current?.();
    setState(initial);
  }, []);

  const busy = state.phase !== 'idle' && state.phase !== 'completed' && state.phase !== 'error';
  return { state, run, reset, showRecorded, openRun, busy };
}
