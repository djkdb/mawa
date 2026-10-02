import { useEffect, useRef, useState } from 'react';
import { PROJECT } from '@mawa/shared';
import { ActivityTimeline } from './components/ActivityTimeline.js';
import { HowItWorks } from './components/HowItWorks.js';
import { McpConnections } from './components/McpConnections.js';
import { Pipeline } from './components/Pipeline.js';
import { PromptPanel } from './components/PromptPanel.js';
import { ReportView } from './components/ReportView.js';
import { SectionRail } from './components/SectionRail.js';
import { TopNav } from './components/TopNav.js';
import { IS_DEMO_BUILD, getClient, type Status } from './lib/client.js';
import { useAgentRun } from './lib/useAgentRun.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, run, showRecorded, busy } = useAgentRun();
  const resultRef = useRef<HTMLDivElement>(null);
  const recorded = IS_DEMO_BUILD;
  const available = new Set(['ask', 'connections', ...(state.phase !== 'idle' ? ['activity'] : []), ...(state.report ? ['report'] : [])]);

  const refresh = () => getClient().getStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));

  useEffect(() => {
    void refresh();
    if (IS_DEMO_BUILD) { showRecorded(); return; }
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice(`${q.get('connected')} 연결됨`);
    if (q.get('auth_error')) setNotice(`연결 실패: ${q.get('auth_error')}`);
    if (q.has('connected') || q.has('auth_error')) window.history.replaceState({}, '', '/');
  }, [showRecorded]);

  useEffect(() => {
    if (state.phase === 'starting') resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state.phase]);

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 sm:px-6">
      <TopNav status={status} />
      <main className="flex flex-col gap-5 py-5">
        {statusError && !IS_DEMO_BUILD && (
          <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">API 서버에 연결할 수 없습니다 ({statusError}). <code className="font-mono">npm run dev</code>로 실행하거나 데모 빌드를 여세요.</p>
        )}
        {notice && <p role="status" className="surface px-4 py-3 text-sm">{notice} <button type="button" className="ml-2 text-text-2 underline" onClick={() => setNotice(null)}>닫기</button></p>}

        <section className="grid items-center gap-8 py-4 sm:py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="max-w-2xl text-[28px] font-semibold sm:text-[40px]">흩어진 업무 데이터를 연결하면, AI 에이전트가 이번 주를 정리해 줍니다.</h2>
            <p className="mt-3 max-w-xl text-base text-text-2 sm:text-lg">GitHub, Gmail, Google Calendar를 MCP로 연결하고 질문 하나를 고르면, 에이전트가 필요한 도구를 직접 골라 조회하고 모든 문장에 출처가 붙은 주간 리포트를 만듭니다.</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-3">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-github align-middle" aria-hidden />GitHub</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-gmail align-middle" aria-hidden />Gmail</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-calendar align-middle" aria-hidden />Google Calendar</span>
              <span>· MCP 서버 3개 · 도구 10개</span>
            </div>
          </div>
          <div className="surface p-4 sm:p-6"><Pipeline /></div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_264px]">
          <SectionRail available={available} />
          <div className="flex min-w-0 flex-col gap-5">
            <PromptPanel status={status} busy={busy} onRun={run} />
            <div ref={resultRef} className="scroll-mt-20" />
            <ActivityTimeline events={state.events} phase={state.phase} recorded={recorded} />
            {state.error && state.phase === 'error' && <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>}
            {state.report && <ReportView report={state.report} warnings={state.warnings} recorded={recorded} />}
            <div className="xl:hidden"><McpConnections status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} /></div>
          </div>
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-20"><McpConnections status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} /></div>
          </aside>
        </div>

        <HowItWorks />

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[13px] text-text-3">
          <span>{PROJECT.name} · AI × MCP × AX · {PROJECT.author.name}의 개인 학습 프로젝트</span>
          <a href={PROJECT.author.instagram.url} target="_blank" rel="noreferrer" className="hover:text-text">{PROJECT.author.instagram.handle}</a>
        </footer>
      </main>
    </div>
  );
}
