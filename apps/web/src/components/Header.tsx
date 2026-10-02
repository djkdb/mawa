import { PROJECT } from '@mawa/shared';
import { IS_DEMO_BUILD, PORTFOLIO_URL, REPO_URL, type Status } from '../lib/client.js';
import { ModeBadge } from './ModeBadge.js';

export function Header({ status }: { status: Status | null }) {
  const llm = status
    ? status.llm.isModel
      ? `${status.llm.provider} · ${status.llm.model}`
      : IS_DEMO_BUILD
        ? 'none · recorded replay'
        : 'scripted (no API key)'
    : '…';
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line/70 pb-4">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <div>
          <h1 className="font-mono text-[13px] font-semibold tracking-[0.3em] text-white">{PROJECT.name}</h1>
          <p className="mt-0.5 hidden text-xs text-fog sm:block">{PROJECT.tagline.join(' ')}</p>
        </div>
        <ModeBadge mode={status?.defaultMode ?? 'demo'} />
      </div>
      <nav aria-label="Project links" className="flex items-center gap-4 font-mono text-[11px] text-fog">
        <span className="hidden md:inline">
          LLM&nbsp;<span className={status?.llm.isModel ? 'text-emerald-300' : 'text-amber-300'}>{llm}</span>
        </span>
        {PORTFOLIO_URL && <a href={PORTFOLIO_URL} className="hover:text-white">Portfolio</a>}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
      </nav>
    </header>
  );
}
