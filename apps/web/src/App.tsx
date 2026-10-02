import { useEffect, useRef, useState } from 'react';
import { PROJECT } from '@mawa/shared';
import { ActivityTimeline } from './components/ActivityTimeline.js';
import { Header } from './components/Header.js';
import { HowItWorks } from './components/HowItWorks.js';
import { McpConnections } from './components/McpConnections.js';
import { PromptPanel } from './components/PromptPanel.js';
import { ReportView } from './components/ReportView.js';
import { IS_DEMO_BUILD, getClient, type Status } from './lib/client.js';
import { useAgentRun } from './lib/useAgentRun.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, run, showRecorded, busy } = useAgentRun();
  const resultRef = useRef<HTMLDivElement>(null);
  const recorded = IS_DEMO_BUILD;

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
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <Header status={status} />

      {statusError && !IS_DEMO_BUILD && (
        <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">API 서버에 연결할 수 없습니다 ({statusError}). <code className="font-mono">npm run dev</code>로 실행하거나 데모 빌드를 여세요.</p>
      )}
      {notice && (
        <p role="status" className="surface px-4 py-3 text-sm">{notice} <button type="button" className="ml-2 text-text-2 underline" onClick={() => setNotice(null)}>닫기</button></p>
      )}

      <section className="py-4 sm:py-8">
        <h2 className="max-w-3xl text-[28px] font-semibold sm:text-[40px]">흩어진 업무 데이터를 연결하면,<br className="hidden sm:block" /> AI 에이전트가 이번 주를 정리해 줍니다.</h2>
        <p className="mt-3 max-w-2xl text-base text-text-2 sm:text-lg">GitHub, Gmail, Google Calendar를 MCP로 연결하고 질문 하나를 고르면, 에이전트가 필요한 도구를 직접 골라 조회하고 모든 문장에 출처가 붙은 주간 리포트를 만듭니다.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_272px]">
        <div className="flex min-w-0 flex-col gap-5">
          <PromptPanel status={status} busy={busy} onRun={run} />
          <div ref={resultRef} className="scroll-mt-4" />
          <ActivityTimeline events={state.events} phase={state.phase} recorded={recorded} />
          {state.error && state.phase === 'error' && <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>}
          {state.report && <ReportView report={state.report} warnings={state.warnings} recorded={recorded} />}
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <McpConnections status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} />
        </aside>
      </div>

      <HowItWorks />

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[13px] text-text-3">
        <span>{PROJECT.name} · AI × MCP × AX · {PROJECT.author.name}의 개인 학습 프로젝트</span>
        <a href={PROJECT.author.instagram.url} target="_blank" rel="noreferrer" className="hover:text-text">{PROJECT.author.instagram.handle}</a>
      </footer>
    </main>
  );
}
