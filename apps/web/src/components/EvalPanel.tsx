import { CircleCheck, CircleDashed, Gauge, SearchCheck } from 'lucide-react';
import evalResults from '@mawa/shared/demo/eval-results.json';
import type { RunScore } from '@mawa/shared';

type Result = RunScore & { title: string; writer: string };
export const EVAL = (evalResults as unknown as { results: Result[] }).results;

/** "정답 대비": how many of the hand-written gold items this recorded run's report found, and what the omission check added. */
export function EvalPanel({ recordedId }: { recordedId: string | null }) {
  const r = recordedId ? EVAL.find((x) => x.runId === recordedId) : undefined;
  if (!r) return null;
  return (
    <section aria-labelledby="eval-heading" className="surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Gauge className="h-[18px] w-[18px] self-center text-accent" aria-hidden />
        <h2 id="eval-heading" className="text-[15px] font-semibold">정답 대비 평가 · {r.title}</h2>
        <span className="tnum text-sm text-text-2">리포트 {r.inReport}/{r.total}{r.withCheck > r.inReport ? ` · 누락 검사 포함 ${r.withCheck}/${r.total}` : ''}</span>
        <span className="text-xs text-text-3">작성: {r.writer === 'scripted' ? '스크립트' : r.writer}</span>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {r.items.map((i) => (
          <li key={i.id} className="flex min-w-0 items-start gap-2 text-sm">
            {i.foundBy === 'report' ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="리포트에 있음" /> : i.foundBy === 'check' ? <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-label="누락 검사가 잡음" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="놓침" />}
            <span className={i.foundBy === 'report' ? 'text-text' : 'text-text-2'}>{i.label}{i.foundBy === 'check' ? <span className="text-xs text-warn"> · 리포트엔 없고 누락 검사가 잡음</span> : i.foundBy === null ? <span className="text-xs text-danger"> · 놓침</span> : null}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-3">샘플 데이터에 사람이 미리 적어 둔 정답 목록과 비교합니다(<code className="font-mono">npm run eval</code>). 날짜 불일치처럼 비교가 필요한 항목은 누락 검사가 잡을 수 없어 리포트만 셉니다.</p>
    </section>
  );
}

/** All scored runs: the same question answered by the scripted writer and by a real model. */
export function EvalTable() {
  if (!EVAL.length) return null;
  return (
    <section aria-labelledby="evaltable-heading" className="surface mb-5 p-4 sm:p-5">
      <h2 id="evaltable-heading" className="flex items-center gap-2 text-[15px] font-semibold"><Gauge className="h-4 w-4 text-accent" aria-hidden />품질 평가 · 정답 대비 찾은 비율</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">품질 평가: 질문별 정답 대비 찾은 비율</caption>
          <thead><tr className="text-left text-xs text-text-3"><th className="py-1.5 pr-3 font-medium">질문</th><th className="py-1.5 pr-3 font-medium">작성</th><th className="py-1.5 pr-3 text-right font-medium">리포트</th><th className="py-1.5 pr-3 text-right font-medium">누락 검사 포함</th><th className="py-1.5 font-medium">놓친 것</th></tr></thead>
          <tbody>
            {EVAL.map((r) => (
              <tr key={r.runId} className="border-t border-line/70 align-top">
                <td className="py-2 pr-3 text-text">{r.title}</td>
                <td className="py-2 pr-3 font-mono text-xs text-text-2">{r.writer === 'scripted' ? 'scripted' : r.writer.split('/').at(-1)}</td>
                <td className="tnum py-2 pr-3 text-right font-semibold text-text">{r.inReport}/{r.total}</td>
                <td className="tnum py-2 pr-3 text-right text-text-2">{r.withCheck}/{r.total}</td>
                <td className="py-2 text-xs text-text-3">{r.items.filter((i) => i.foundBy !== 'report').map((i) => `${i.label}${i.foundBy === 'check' ? '(검사)' : ''}`).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
