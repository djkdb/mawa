import { PORTFOLIO_URL, REPO_URL, type Status } from '../lib/client.js';
import { ModeBadge } from './ModeBadge.js';

const LINKS = [
  { href: '#ask', label: '데모' },
  { href: '#report', label: '리포트' },
  { href: '#how', label: '작동 방식' },
  ...(PORTFOLIO_URL ? [{ href: `${PORTFOLIO_URL}/#architecture`, label: '아키텍처' }, { href: PORTFOLIO_URL, label: '포트폴리오' }] : []),
  { href: REPO_URL, label: 'GitHub', external: true },
];

export function TopNav({ status }: { status: Status | null }) {
  return (
    <div className="topnav -mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <h1 className="shrink-0 text-[15px] font-semibold text-text">My AI Work Agent</h1>
          <span className="hidden sm:inline-flex"><ModeBadge mode={status?.defaultMode ?? 'demo'} /></span>
        </div>
        <nav aria-label="주 메뉴" className="-mr-2 flex items-center gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} target={'external' in l && l.external ? '_blank' : undefined} rel={'external' in l && l.external ? 'noreferrer' : undefined} className="shrink-0 rounded-md px-2.5 py-1.5 text-text-2 hover:bg-surface hover:text-text">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
