import { useState } from 'react';
import { CircleHelp, FileText, History, Home, Plug, Settings, X } from 'lucide-react';
import { IS_DEMO_BUILD, type Status } from '../lib/client.js';
import type { Route } from '../lib/useHashRoute.js';
import { HowItWorks } from './HowItWorks.js';
import { ModeBadge } from './ModeBadge.js';

const NAV: Array<{ id: Route; label: string; icon: typeof Home }> = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'report', label: '리포트', icon: FileText },
  { id: 'runs', label: '실행 기록', icon: History },
  { id: 'connections', label: '연결', icon: Plug },
  { id: 'settings', label: '설정', icon: Settings },
];
const TITLE: Record<Route, string> = { home: '홈', report: '주간 업무 리포트', runs: '실행 기록', connections: '연결된 소스', settings: '설정' };

export function Shell({ route, navigate, status, children }: { route: Route; navigate: (r: Route) => void; status: Status | null; children: React.ReactNode }) {
  const [help, setHelp] = useState(false);
  const workspace = IS_DEMO_BUILD ? 'demo-user' : (status?.integrations.github.account ?? status?.integrations.google.account ?? '내 워크스페이스');
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface/60 lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-[15px] font-semibold">My AI Work Agent</span>
        </div>
        <div className="mx-3 mb-2 rounded-lg bg-surface-2 px-3 py-2">
          <div className="text-xs text-text-3">워크스페이스</div>
          <div className="truncate text-sm font-medium">{workspace}</div>
        </div>
        <nav aria-label="주 메뉴" className="rail flex-1 px-3">
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={n.id === 'home' ? '#/' : `#/${n.id}`} aria-current={route === n.id ? 'true' : undefined} onClick={(e) => { e.preventDefault(); navigate(n.id); }}>
                  <n.icon className="h-4 w-4" aria-hidden /> {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="px-5 py-4"><ModeBadge mode={status?.defaultMode ?? 'demo'} /></div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="topnav">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.svg" alt="" className="h-6 w-6 lg:hidden" />
              <h1 className="truncate text-[15px] font-semibold">{TITLE[route]}</h1>
              <span className="hidden sm:inline-flex lg:hidden"><ModeBadge mode={status?.defaultMode ?? 'demo'} /></span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setHelp(true)} aria-label="작동 방식 보기" className="rounded-md p-2 text-text-2 hover:bg-surface hover:text-text"><CircleHelp className="h-5 w-5" /></button>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-2 text-xs font-semibold text-text" title={workspace} aria-label={`사용자 ${workspace}`}>{workspace.slice(0, 1).toUpperCase()}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">{children}</main>

        <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV.map((n) => (
            <a key={n.id} href={n.id === 'home' ? '#/' : `#/${n.id}`} onClick={(e) => { e.preventDefault(); navigate(n.id); }} aria-current={route === n.id ? 'true' : undefined} className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${route === n.id ? 'text-text' : 'text-text-3'}`}>
              <n.icon className="h-5 w-5" aria-hidden /> {n.label}
            </a>
          ))}
        </nav>
      </div>

      {help && (
        <div role="dialog" aria-modal="true" aria-label="작동 방식" className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div className="surface hairline max-h-[85dvh] w-full max-w-2xl overflow-auto p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2"><button type="button" onClick={() => setHelp(false)} aria-label="닫기" className="rounded-md p-1.5 text-text-2 hover:bg-surface-2 hover:text-text"><X className="h-4 w-4" /></button></div>
            <div className="-mt-6"><HowItWorks /></div>
          </div>
        </div>
      )}
    </div>
  );
}
