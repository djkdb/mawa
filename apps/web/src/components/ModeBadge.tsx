import type { AgentMode } from '@mawa/shared';

/** Driven by data (event/report `mode`), never by a UI flag, so it cannot be forgotten. */
export function ModeBadge({ mode, size = 'sm' }: { mode: AgentMode; size?: 'sm' | 'md' }) {
  const demo = mode === 'demo';
  const pad = size === 'md' ? 'px-3 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-mono font-semibold uppercase tracking-[0.18em] ${pad} ${
        demo ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
      }`}
      title={demo ? 'Synthetic fixture data served by the MCP servers in demo mode. Not your data.' : 'Live data from your connected accounts.'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${demo ? 'bg-amber-300' : 'bg-emerald-300'}`} aria-hidden />
      {demo ? 'Demo mode · synthetic data' : 'Real mode · live data'}
    </span>
  );
}
