import { PORTFOLIO_URL, REPO_URL, type Status } from '../lib/client.js';
import { ModeBadge } from './ModeBadge.js';

export function Header({ status }: { status: Status | null }) {
  return (
    <header className="flex items-center justify-between gap-4 py-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <h1 className="shrink-0 text-[15px] font-semibold text-text">My AI Work Agent</h1>
        <ModeBadge mode={status?.defaultMode ?? 'demo'} />
      </div>
      <nav aria-label="프로젝트 링크" className="flex items-center gap-5 text-sm text-text-2">
        {PORTFOLIO_URL && <a href={PORTFOLIO_URL} className="hover:text-text">포트폴리오</a>}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-text">GitHub</a>
      </nav>
    </header>
  );
}
