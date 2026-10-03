import { useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle2, Info, Play, Radio } from 'lucide-react';
import type { AgentMode } from '@mawa/shared';
import { ActivityTimeline } from '../components/ActivityTimeline.js';
import { CategoryBoard } from '../components/CategoryBoard.js';
import { PromptPanel } from '../components/PromptPanel.js';
import { StatStrip, reportTitle } from '../components/ReportView.js';
import { DEMO_EXAMPLES, IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { periodKo, DEMO_PERSONA } from '../lib/copy.js';
import type { AgentRunState } from '../lib/useAgentRun.js';

/** "도구 3/4" while running: done calls over what the plan asked for. */
function progressOf(state: AgentRunState): string {
  const planned = state.events.filter((e) => e.type === 'llm_response').reduce((n, e) => n + (e.type === 'llm_response' ? e.toolCalls.length : 0), 0);
  const done = state.events.filter((e) => e.type === 'tool_call_completed' || e.type === 'tool_call_failed').length;
  if (state.events.some((e) => e.type === 'context_aggregated')) return '리포트 작성 중';
  if (planned) return `도구 ${done}/${planned}`;
  return state.events.some((e) => e.type === 'llm_request') ? '계획 세우는 중' : 'MCP 연결 중';
}

/** Dashboard: what matters this week first (risks, actions, deadlines), then the composer and the run. */
export function HomePage({ status, state, busy, onRun, reportHref }: { status: Status | null; state: AgentRunState; busy: boolean; onRun: (p: string, m: AgentMode) => void; reportHref: string }) {
  const report = state.report;
  const who = IS_DEMO_BUILD ? DEMO_PERSONA.short : (status?.integrations.github.account ?? '');
  const activityHeading = useRef<HTMLHeadingElement>(null);
  const prev = useRef(state.phase);
  useEffect(() => {
    if (state.phase === 'starting' && prev.current !== 'starting') {
      requestAnimationFrame(() => {
        const el = activityHeading.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      });
    }
    prev.current = state.phase;
  }, [state.phase]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const calls = state.events.filter((e) => e.type === 'tool_call_completed').length;
  const rpc = state.events.filter((e) => e.type === 'mcp_message').length;
  const servers = new Set(state.events.flatMap((e) => (e.type === 'mcp_server_connected' ? [e.server] : []))).size;
  const justFinished = state.phase === 'completed' && Boolean(state.startedAt);
  const sources = state.report?.sources.length ?? 0;
  const generated = report ? (state.startedAt ? `${Math.max(0, Math.round((Date.now() - state.startedAt) / 60_000))}분 전 생성` : `${new Date(report.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${IS_DEMO_BUILD ? '기록' : '생성'}`) : '';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl bg-surface px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-sm leading-relaxed text-text-2">
            <b className="font-semibold text-text">GitHub·Gmail·Google Calendar·eCampus를 읽고 출처가 달린 주간 리포트를 써 주는 AI 업무 에이전트입니다.</b>
            {IS_DEMO_BUILD && <> 지금은 <span className="text-amber-200">데모 워크스페이스</span>로, 성준님의 한 주를 가정해 만든 가상의 샘플 데이터(수업·팀플·인턴 준비)로 기록된 실행을 재생합니다. 실제 계정에는 접속하지 않습니다.</>}
          </p>
        </div>
        {IS_DEMO_BUILD && DEMO_EXAMPLES[0] && (
          <button type="button" disabled={busy} onClick={() => onRun(DEMO_EXAMPLES[0]!.prompt, 'demo')} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
            <Play className="h-4 w-4" aria-hidden />{busy ? '실행 중…' : '데모 실행해 보기 · 약 10초'}
          </button>
        )}
      </div>

      {justFinished && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ok/10 px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
          <span className="font-medium text-text">리포트 완성</span>
          <span className="tnum text-text-2">도구 {calls}회 · 출처 {sources}건 · {reportTitle(state.prompt)}</span>
          <a href={reportHref} className="ml-auto inline-flex min-h-9 items-center gap-1 font-medium text-accent hover:underline">리포트 보기 <ArrowRight className="h-4 w-4" aria-hidden /></a>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">{who ? `${who}님, ` : ''}이번 주</h2>
          {report && <p className="text-sm text-text-2">{periodKo(report.period)} · {reportTitle(state.prompt)} · {generated}</p>}
        </div>
        {report && <a href={reportHref} className="inline-flex min-h-9 items-center gap-1 text-sm text-accent hover:underline">리포트 전체 보기 <ArrowRight className="h-4 w-4" aria-hidden /></a>}
      </div>
      {servers > 0 && (
        <button type="button" onClick={() => scrollTo('activity')} className="-mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-text-2 hover:text-text">
          <Radio className="h-3.5 w-3.5 text-calendar" aria-hidden />MCP 서버 {servers}곳 · 도구 호출 {calls}회 · JSON-RPC 메시지 {rpc}개 <span className="text-text-3">· 통신 보기 ↓</span>
        </button>
      )}

      {report && <StatStrip report={report} />}
      {report && <CategoryBoard report={report} runId={state.runId} />}

      <PromptPanel status={status} busy={busy} onRun={onRun} progress={busy ? progressOf(state) : null} />
      <ActivityTimeline events={state.events} phase={state.phase} recorded={IS_DEMO_BUILD} runId={state.runId} headingRef={activityHeading} />
      {state.error && state.phase === 'error' && <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>}
    </div>
  );
}
