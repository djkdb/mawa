import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentMode, WeeklyWorkReport } from '@mawa/shared';
import { fetchRun, startRun, subscribeRun } from './api.js';

export type RunPhase = 'idle' | 'starting' | 'running' | 'success' | 'error';

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

export function useAgentRun() {
  const [state, setState] = useState<AgentRunState>(initial);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const run = useCallback(async (prompt: string, mode: AgentMode) => {
    unsubscribe.current?.();
    setState({ ...initial, phase: 'starting', mode });
    try {
      const started = await startRun(prompt, mode);
      setState((s) => ({ ...s, phase: 'running', runId: started.runId, mode: started.mode, warnings: started.warnings }));
      unsubscribe.current = subscribeRun(started.runId, {
        onEvent: (e) =>
          setState((s) => ({
            ...s,
            events: [...s.events, e],
            report: e.type === 'report_generated' ? e.report : s.report,
            error: e.type === 'agent_run_completed' && e.status === 'error' ? (e.error ?? 'Run failed') : s.error,
          })),
        onDone: async (status) => {
          const record = await fetchRun(started.runId).catch(() => null);
          setState((s) => ({
            ...s,
            phase: status === 'success' ? 'success' : 'error',
            report: record?.report ?? s.report,
            warnings: record?.warnings ?? s.warnings,
            error: record?.error ?? s.error,
          }));
        },
        onError: (msg) => setState((s) => (s.phase === 'running' ? { ...s, phase: 'error', error: msg } : s)),
      });
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const reset = useCallback(() => {
    unsubscribe.current?.();
    setState(initial);
  }, []);

  return { state, run, reset };
}
