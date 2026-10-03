import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { policyFigures } from '../lib/audit.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { kb } from './McpWire.js';

/**
 * The same question with and without a data policy, side by side: what reached the model,
 * what was refused or left out. Both columns are computed from recorded events, not typed in.
 */
export function PolicyCompare({ before, after, beforeRunId, labels }: { before: AgentEvent[]; after: AgentEvent[]; beforeRunId: string; labels: [string, string] }) {
  const a = policyFigures(before);
  const b = policyFigures(after);
  const rows: Array<[string, number | string, number | string, string?]> = [
    ['허용된 도구에서 읽은 횟수', a.reads, b.reads],
    ['허용 목록에서 숨긴 도구', a.blockedTools, b.blockedTools, '모델에게 보이는 도구 목록에서 뺐습니다'],
    ['호출 단계에서 거절', a.denied, b.denied, '숨긴 도구를 이름으로 요청해도 MCP 서버로 가지 않습니다'],
    ['LLM·리포트에서 뺀 항목', a.excluded, b.excluded, '제외 규칙에 걸린 메일·일정'],
    ['가린 메일 주소', a.maskedEmails, b.maskedEmails],
    ['가린 전화번호·학번', a.maskedPhones, b.maskedPhones],
    ['리포트가 쓴 출처', a.sources, b.sources],
    ['리포트 작성 요청 크기', kb(a.analysisBytes), kb(b.analysisBytes)],
  ];
  return (
    <section aria-labelledby="compare-heading" className="surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ShieldCheck className="h-[18px] w-[18px] text-ok" aria-hidden />
        <h2 id="compare-heading" className="text-[15px] font-semibold">정책 비교 · 같은 질문, 다른 정책</h2>
        <a href={hrefFor('report', beforeRunId)} className="ml-auto inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent hover:underline">{labels[0]} 리포트 <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-text-3">
              <th className="py-1.5 pr-3 font-medium">항목</th>
              <th className="w-28 py-1.5 pr-3 text-right font-medium">{labels[0]}</th>
              <th className="w-28 py-1.5 text-right font-medium text-text-2">{labels[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, x, y, hint]) => (
              <tr key={label} className="border-t border-line/70">
                <td className="py-2 pr-3"><span className="text-text">{label}</span>{hint && <span className="block text-xs text-text-3">{hint}</span>}</td>
                <td className="tnum py-2 pr-3 text-right text-text-2">{x}</td>
                <td className={`tnum py-2 text-right font-semibold ${x !== y ? 'text-text' : 'text-text-2'}`}>{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
