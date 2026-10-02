import { PROJECT } from '@mawa/shared';
import type { Status } from '../lib/api.js';
import { ModeBadge } from './ModeBadge.js';

export function Header({ status }: { status: Status | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 pb-5">
      <div>
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <h1 className="font-mono text-sm font-semibold tracking-[0.3em] text-white">{PROJECT.name}</h1>
          {status && <ModeBadge mode={status.defaultMode} />}
        </div>
        <p className="mt-2 text-sm text-fog">{PROJECT.tagline.join(' ')}</p>
      </div>
      <div className="flex items-center gap-4 font-mono text-[11px] text-fog">
        <span>
          LLM&nbsp;
          <span className={status?.llm.isModel ? 'text-emerald-300' : 'text-amber-300'}>
            {status ? (status.llm.isModel ? `${status.llm.provider}/${status.llm.model}` : 'scripted (no API key)') : '…'}
          </span>
        </span>
        <span>
          MCP&nbsp;<span className="text-accent">github · gmail · calendar</span>
        </span>
      </div>
    </header>
  );
}
