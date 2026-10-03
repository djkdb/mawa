import { useEffect, useRef } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import type { AgentMode, WeeklyWorkReport } from '@mawa/shared';
import { ActivityTimeline } from '../components/ActivityTimeline.js';
import { PromptPanel } from '../components/PromptPanel.js';
import { StatStrip, reportTitle } from '../components/ReportView.js';
import { IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { PRIORITY_KO, periodKo, relDay, sectionTitle, timeKo } from '../lib/copy.js';
import type { AgentRunState } from '../lib/useAgentRun.js';

function Highlights({ report, prompt, reportHref }: { report: WeeklyWorkReport; prompt: string | null; reportHref: string }) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const risks = [...(report.sections.find((s) => s.id === 'potential_risks')?.items ?? [])].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);
  const actions = [...(report.sections.find((s) => s.id === 'next_actions')?.items ?? [])].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);
  const ref = new Date(report.generatedAt).getTime();
  const upcoming = report.sources
    .filter((s) => s.metadata['kind'] === 'event' && s.timestamp && new Date(s.timestamp).getTime() >= ref)
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
    .slice(0, 3);

  const Card = ({ title, children, more }: { title: string; children: React.ReactNode; more?: number }) => (
    <section className="surface flex flex-col p-5">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <div className="mt-2 flex-1">{children}</div>
      {more ? <a href={reportHref} className="mt-3 inline-flex min-h-9 items-center text-sm text-text-2 hover:text-text">{more}개 더 보기</a> : null}
    </section>
  );
  const Item = ({ priority, text }: { priority?: 'high' | 'medium' | 'low' | undefined; text: string }) => (
    <li className="flex items-start gap-2 py-1.5 text-sm leading-relaxed text-text">
      {priority ? <span className={`pri pri-${priority} mt-0.5 shrink-0`}>{PRIORITY_KO[priority]}</span> : <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-sm bg-inferred" aria-hidden />}
      <span className="min-w-0">{text}</span>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {risks.length > 0 && (
        <Card title={sectionTitle('potential_risks', prompt)} more={Math.max(0, risks.length - 3)}>
          <ul>{risks.slice(0, 3).map((i) => <Item key={i.id} priority={i.priority} text={i.text} />)}</ul>
        </Card>
      )}
      {actions.length > 0 && (
        <Card title="다음 액션" more={Math.max(0, actions.length - 3)}>
          <ul>{actions.slice(0, 3).map((i) => <Item key={i.id} priority={i.priority} text={i.text} />)}</ul>
        </Card>
      )}
      <Card title="다가오는 일정">
        {upcoming.length ? (
          <ul>
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="tnum w-12 shrink-0 font-semibold text-calendar">{relDay(s.timestamp!, ref)}</span>
                <span className="min-w-0"><span className="block text-text">{s.title}</span><span className="block text-xs text-text-3">{timeKo(s.timestamp!)}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-text-3">이번 실행에서는 일정을 조회하지 않았습니다.</p>}
        {IS_DEMO_BUILD && upcoming.length > 0 && <p className="mt-2 text-xs text-text-3">기록 시점 기준</p>}
      </Card>
    </div>
  );
}

/** Dashboard: what matters this week first (risks, actions, deadlines), then the composer and the run. */
export function HomePage({ status, state, busy, onRun, reportHref }: { status: Status | null; state: AgentRunState; busy: boolean; onRun: (p: string, m: AgentMode) => void; reportHref: string }) {
  const report = state.report;
  const who = IS_DEMO_BUILD ? 'demo-user' : (status?.integrations.github.account ?? '');
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm leading-relaxed text-text-2">
          <b className="font-semibold text-text">GitHub·Gmail·Google Calendar를 읽고 출처가 달린 주간 리포트를 써 주는 AI 업무 에이전트입니다.</b>
          {IS_DEMO_BUILD && <> 지금은 <span className="text-amber-200">데모 워크스페이스</span>로, 가상의 demo-user 샘플 데이터로 기록된 실행을 재생합니다. 실제 계정에는 접속하지 않습니다.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">{who ? `${who}님, ` : ''}이번 주 업무</h2>
          {report && <p className="text-sm text-text-2">{periodKo(report.period)} · {reportTitle(state.prompt)}</p>}
        </div>
        {report && <a href={reportHref} className="inline-flex min-h-9 items-center gap-1 text-sm text-accent hover:underline">리포트 전체 보기 <ArrowRight className="h-4 w-4" aria-hidden /></a>}
      </div>

      {report && <StatStrip report={report} />}
      {report && <Highlights report={report} prompt={state.prompt} reportHref={reportHref} />}

      <PromptPanel status={status} busy={busy} onRun={onRun} />
      <ActivityTimeline events={state.events} phase={state.phase} recorded={IS_DEMO_BUILD} runId={state.runId} headingRef={activityHeading} />
      {state.error && state.phase === 'error' && <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>}
    </div>
  );
}
