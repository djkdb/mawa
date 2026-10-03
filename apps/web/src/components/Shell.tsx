import { useEffect, useRef } from 'react';
import { CircleHelp, Code2, FileText, History, Home, Monitor, Moon, Plug, ScrollText, Settings, Sun, X } from 'lucide-react';
import { IS_DEMO_BUILD, REPO_URL, type Status } from '../lib/client.js';
import { DEMO_PERSONA } from '../lib/copy.js';
import { useTheme, type ThemePref } from '../lib/theme.js';
import { hrefFor, type Route } from '../lib/useHashRoute.js';
import { HowItWorks } from './HowItWorks.js';
import { ModeBadge } from './ModeBadge.js';

const NAV: Array<{ id: Route; label: string; icon: typeof Home }> = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'report', label: '리포트', icon: FileText },
  { id: 'runs', label: '실행 기록', icon: History },
  { id: 'audit', label: '감사 로그', icon: ScrollText },
  { id: 'connections', label: '연결', icon: Plug },
  { id: 'settings', label: '설정', icon: Settings },
];
export const ROUTE_TITLE: Record<Route, string> = { home: '홈', report: '리포트', runs: '실행 기록', audit: '감사 로그', connections: '연결된 소스', settings: '설정' };

const THEMES: Array<{ id: ThemePref; label: string; Icon: typeof Sun }> = [
  { id: 'system', label: '시스템 설정 따르기', Icon: Monitor },
  { id: 'light', label: '라이트 테마', Icon: Sun },
  { id: 'dark', label: '다크 테마', Icon: Moon },
];

/** Cycles system → light → dark; the icon shows the current choice. */
function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const i = THEMES.findIndex((t) => t.id === pref);
  const cur = THEMES[i]!;
  const next = THEMES[(i + 1) % THEMES.length]!;
  return (
    <button type="button" onClick={() => setPref(next.id)} aria-label={`테마: ${cur.label}. 눌러서 ${next.label}`} title={`테마: ${cur.label}`} className="rounded-md p-2.5 text-text-2 hover:bg-surface-2 hover:text-text">
      <cur.Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

export function Shell({ route, reportHref, navigate, status, children }: { route: Route; reportHref: string; navigate: (r: Route) => void; status: Status | null; children: React.ReactNode }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef(true);
  const workspace = IS_DEMO_BUILD ? `${DEMO_PERSONA.name} (샘플)` : (status?.integrations.github.account ?? status?.integrations.google.account ?? '내 워크스페이스');

  // Announce route changes: update the document title and move focus to the page heading (not on first load).
  useEffect(() => {
    document.title = `${ROUTE_TITLE[route]} · My AI Work Agent`;
    if (first.current) { first.current = false; return; }
    h1.current?.focus();
  }, [route]);

  const href = (id: Route) => (id === 'report' ? reportHref : hrefFor(id));
  const go = (e: React.MouseEvent, id: Route) => { if (id !== 'report') { e.preventDefault(); navigate(id); } };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a>
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
                <a href={href(n.id)} aria-current={route === n.id ? 'page' : undefined} onClick={(e) => go(e, n.id)}>
                  <n.icon className="h-4 w-4" aria-hidden /> {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 px-5 py-4">
          <ModeBadge mode={status?.defaultMode ?? 'demo'} />
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-text-3 hover:text-text"><Code2 className="h-3.5 w-3.5" aria-hidden />소스 코드</a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="topnav">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.svg" alt="" className="h-6 w-6 lg:hidden" />
              <span className="whitespace-nowrap text-[15px] font-semibold max-[479px]:hidden lg:hidden" aria-hidden>My AI Work Agent</span>
              <span className="text-text-3 max-[479px]:hidden lg:hidden" aria-hidden>/</span>
              <h1 ref={h1} tabIndex={-1} className="truncate text-[15px] font-semibold outline-none">{ROUTE_TITLE[route]}</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="lg:hidden"><ModeBadge mode={status?.defaultMode ?? 'demo'} /></span>
              <ThemeToggle />
              <button type="button" onClick={() => dialog.current?.showModal()} aria-label="작동 방식 보기" className="rounded-md p-2.5 text-text-2 hover:bg-surface-2 hover:text-text"><CircleHelp className="h-5 w-5" aria-hidden /></button>
              <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-accent-2 text-xs font-semibold text-text sm:flex" title={workspace} role="img" aria-label={`사용자 ${workspace}`}>{workspace.slice(0, 1).toUpperCase()}</span>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 pb-28 outline-none sm:px-6 lg:pb-10">{children}</main>

        <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV.map((n) => (
            <a key={n.id} href={href(n.id)} onClick={(e) => go(e, n.id)} aria-current={route === n.id ? 'page' : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${route === n.id ? 'font-semibold text-accent' : 'text-text-3'}`}>
              <n.icon className="h-5 w-5" aria-hidden /> {n.label}
            </a>
          ))}
        </nav>
      </div>

      <dialog ref={dialog} aria-label="작동 방식" className="m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[85dvh] overflow-auto rounded-xl border border-line bg-surface p-0 text-text" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className="flex justify-end p-2">
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="닫기" className="rounded-md p-2.5 text-text-2 hover:bg-surface-2 hover:text-text"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="-mt-8"><HowItWorks /></div>
      </dialog>
    </div>
  );
}
