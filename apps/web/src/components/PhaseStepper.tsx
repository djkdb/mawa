import { PHASE_ORDER, type RunPhase } from '../lib/useAgentRun.js';

const LABEL: Record<RunPhase, string> = {
  idle: 'Idle',
  starting: 'Starting',
  discovering: 'Discovering tools',
  running: 'Calling MCP tools',
  aggregating: 'Aggregating',
  analyzing: 'Analyzing',
  report: 'Report',
  completed: 'Completed',
  error: 'Failed',
};

/** Coarse state of the run; each step lights up only when its event has arrived. No percentages. */
export function PhaseStepper({ phase }: { phase: RunPhase }) {
  const current = phase === 'error' ? PHASE_ORDER.length : PHASE_ORDER.indexOf(phase);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em]" aria-label="Run phase">
      {PHASE_ORDER.filter((p) => p !== 'aggregating').map((p) => {
        const i = PHASE_ORDER.indexOf(p);
        const state = phase === 'error' ? 'muted' : i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={p} aria-current={state === 'active' ? 'step' : undefined} className={`flex items-center gap-1.5 ${state === 'done' ? 'text-emerald-300' : state === 'active' ? 'text-white' : 'text-fog/50'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${state === 'done' ? 'bg-emerald-300' : state === 'active' ? 'bg-accent' : 'bg-line'}`} aria-hidden />
            {LABEL[p]}
          </li>
        );
      })}
      {phase === 'error' && <li className="text-rose-300">{LABEL.error}</li>}
    </ol>
  );
}
