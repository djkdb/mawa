import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { policyFigures } from '../lib/audit.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { kb } from './McpWire.js';

export interface PolicyColumn { id: string; label: string; hint: string; events: AgentEvent[] }

/**
 * The same question under different data policies, side by side: what reached the model, what was
 * refused or left out. Every number is computed from the recorded events of that run. The column
 * headers switch between the runs, so the report below follows the policy you pick.
 */
export function PolicyCompare({ columns, current, defaultOpen = true }: { columns: PolicyColumn[]; current: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const figs = columns.map((c) => policyFigures(c.events));
  const rows: Array<[string, (f: (typeof figs)[number]) => number | string, string?]> = [
    ['허용 목록에서 숨긴 도구', (f) => f.blockedTools, '모델에게 보이는 도구 목록에서 뺐습니다'],
    ['호출 단계에서 거절', (f) => f.denied, '숨긴 도구를 이름으로 요청해도 MCP 서버로 가지 않습니다'],
    ['LLM·리포트에서 뺀 항목', (f) => f.excluded, '제외 규칙에 걸린 메일·일정'],
    ['가린 메일 주소', (f) => f.maskedEmails],
    ['가린 개인정보', (f) => f.maskedPii, '전화번호·학번·주민등록번호·계좌·카드번호'],
    ['가명으로 바꾼 이름', (f) => f.pseudonyms, '모델에는 사람A·사람B로, 리포트에는 원래 이름으로'],
    ['MCP로 읽은 횟수', (f) => f.reads],
    ['리포트가 쓴 출처', (f) => f.sources],
    ['리포트 작성 요청 크기', (f) => kb(f.analysisBytes)],
  ];
  return (
    <section aria-labelledby="compare-heading" className="surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ShieldCheck className="h-[18px] w-[18px] text-ok" aria-hidden />
        <h2 id="compare-heading" className="text-[15px] font-semibold">정책 비교 · 같은 질문, 다른 정책</h2>
        <span className="text-xs text-text-3">정책을 누르면 그 정책으로 기록된 리포트로 바뀝니다</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="compare-table" className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-text-2 hover:text-text">{open ? '표 접기' : '비교 표 보기'}<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden /></button>
      </div>
      <nav aria-label="정책 선택" className="mt-3 flex flex-wrap gap-1.5">
        {columns.map((c) => (
          <a key={c.id} href={hrefFor('report', `recorded_${c.id}`)} aria-current={c.id === current ? 'page' : undefined} className={`inline-flex min-h-9 flex-col justify-center rounded-lg px-3 py-1.5 text-left text-xs ${c.id === current ? 'bg-accent-2 text-text ring-1 ring-accent' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
            <span className="text-[13px] font-semibold">{c.label}</span>
            <span className="text-text-3">{c.hint}</span>
          </a>
        ))}
      </nav>
      {open && <div id="compare-table" className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-text-3">
              <th className="py-1.5 pr-3 font-medium">항목</th>
              {columns.map((c) => <th key={c.id} className={`w-24 py-1.5 pr-3 text-right font-medium ${c.id === current ? 'text-text' : ''}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, hint]) => (
              <tr key={label} className="border-t border-line/70">
                <td className="py-2 pr-3"><span className="text-text">{label}</span>{hint && <span className="block text-xs text-text-3">{hint}</span>}</td>
                {columns.map((c, i) => <td key={c.id} className={`tnum py-2 pr-3 text-right ${c.id === current ? 'font-semibold text-text' : 'text-text-2'}`}>{get(figs[i]!)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  );
}
