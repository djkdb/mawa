import { ArrowRight } from 'lucide-react';
import type { AgentMode, WeeklyWorkReport } from '@mawa/shared';
import { ActivityTimeline } from '../components/ActivityTimeline.js';
import { PromptPanel } from '../components/PromptPanel.js';
import { IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { KIND_NAME, KIND_SERVER, SERVER_COLOR, dateKo } from '../lib/copy.js';
import type { AgentRunState } from '../lib/useAgentRun.js';

/** Dashboard: this week's numbers, the composer, and the highlights of the latest report. */
export function HomePage({ status, state, busy, onRun, onOpenReport }: { status: Status | null; state: AgentRunState; busy: boolean; onRun: (p: string, m: AgentMode) => void; onOpenReport: () => void }) {
  const report = state.report;
  const who = IS_DEMO_BUILD ? 'demo-user' : (status?.integrations.github.account ?? '');
  const period = report ? `${dateKo(report.period.start)} – ${dateKo(report.period.end)}` : '';
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">{who ? `${who}님, ` : ''}이번 주 업무</h2>
          {period && <p className="text-sm text-text-2">{period}</p>}
        </div>
        {report && <button type="button" onClick={onOpenReport} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">리포트 전체 보기 <ArrowRight className="h-4 w-4" aria-hidden /></button>}
      </div>

      {report && <Stats report={report} />}

      <PromptPanel status={status} busy={busy} onRun={onRun} />
      <ActivityTimeline events={state.events} phase={state.phase} recorded={IS_DEMO_BUILD && state.runId?.startsWith('recorded_') === true} />
      {state.error && state.phase === 'error' && <p role="alert" className="rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>}

      {report && (
        <div className="grid gap-5 md:grid-cols-2">
          {(['potential_risks', 'next_actions'] as const).map((id) => {
            const sec = report.sections.find((s) => s.id === id);
            if (!sec) return null;
            return (
              <section key={id} className="surface p-5">
                <h3 className="text-[15px] font-semibold">{id === 'potential_risks' ? '주의할 점' : '다음 액션'}</h3>
                <ul className="mt-2 space-y-2">
                  {sec.items.slice(0, 3).map((i) => (
                    <li key={i.id} className="flex items-start gap-2.5 text-sm text-text">
                      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-sm ${i.confidence === 'observed' ? 'bg-ok' : 'bg-inferred'}`} aria-hidden />
                      <span>{i.text}</span>
                    </li>
                  ))}
                </ul>
                {sec.items.length > 3 && <button type="button" onClick={onOpenReport} className="mt-3 text-sm text-text-2 hover:text-text">{sec.items.length - 3}개 더 보기</button>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Stats({ report }: { report: WeeklyWorkReport }) {
  const counts = new Map<string, number>();
  for (const s of report.sources) { const k = String(s.metadata['kind'] ?? ''); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const stats = ['commit', 'pr', 'issue', 'event', 'msg'].filter((k) => counts.has(k));
  if (!stats.length) return null;
  return (
    <dl className="grid grid-cols-5 gap-px overflow-hidden rounded-lg bg-line">
      {stats.map((k) => (
        <div key={k} className="bg-surface px-3 py-2.5 sm:px-4 sm:py-3" style={{ boxShadow: `inset 0 2px 0 ${SERVER_COLOR[KIND_SERVER[k] ?? 'github']}` }}>
          <dt className="text-xs text-text-3">{KIND_NAME[k]}</dt>
          <dd className="tnum text-xl font-semibold sm:text-2xl">{counts.get(k)}</dd>
        </div>
      ))}
    </dl>
  );
}
