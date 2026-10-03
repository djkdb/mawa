import { SearchCheck, TriangleAlert } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { relDay } from '../lib/copy.js';

type Coverage = Extract<AgentEvent, { type: 'coverage_checked' }>;

/**
 * "AI가 놓쳤을 수 있는 것": the omission check's result. Deterministic reads found these dated items
 * in the next two weeks, and the report neither cites nor names them. The report is not edited;
 * this is a second opinion the user can act on.
 */
export function CoverageCard({ events, refTime }: { events: AgentEvent[]; refTime: number }) {
  const cov = events.find((e): e is Coverage => e.type === 'coverage_checked');
  if (!cov) return null;
  const when = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
  if (!cov.missed.length) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-ok/10 px-4 py-2.5 text-sm text-text-2">
        <SearchCheck className="h-4 w-4 shrink-0 text-ok" aria-hidden />
        <span><b className="font-semibold text-text">누락 검사:</b> 앞으로 2주 날짜가 있는 항목 {cov.checked}개가 모두 리포트에 있습니다.</span>
      </p>
    );
  }
  return (
    <section aria-labelledby="coverage-heading" className="mt-4 rounded-lg px-4 py-3" style={{ background: 'color-mix(in srgb, var(--color-caution) 10%, var(--color-surface))' }}>
      <h3 id="coverage-heading" className="flex items-center gap-2 text-sm font-semibold text-text"><TriangleAlert className="h-4 w-4 text-warn" aria-hidden />AI가 놓쳤을 수 있는 것 {cov.missed.length}건</h3>
      <p className="mt-0.5 text-xs text-text-2">리포트를 쓴 뒤 규칙 기반으로 다시 읽어 본 결과, 앞으로 2주 안에 날짜가 있는 {cov.checked}개 중 아래 항목은 리포트에 없습니다. 이 검사의 읽기는 모델에 보내지 않았습니다.</p>
      <ul className="mt-2 space-y-1.5">
        {cov.missed.map((m) => (
          <li key={m.sourceId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="tnum rounded bg-calendar/15 px-1.5 text-[11px] font-semibold leading-5 text-calendar">{relDay(m.at, refTime)}</span>
            <span className="font-medium text-text">{m.title}</span>
            <span className="text-xs text-text-3">{when(m.at)} · {m.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
