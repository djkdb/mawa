import { ArrowUpRight } from 'lucide-react';
import { REPO_URL } from '../lib/client.js';

const STEPS: Array<[string, string]> = [
  ['소스를 MCP로 연결', 'GitHub, Gmail, Google Calendar가 각각 독립된 MCP 서버로 붙습니다. 에이전트는 서버가 공개한 도구 목록만 봅니다.'],
  ['에이전트가 도구를 고름', '질문에 필요한 도구를 모델이 직접 선택합니다. "주간 보고서면 무조건 셋 다 호출" 같은 고정 규칙이 없습니다.'],
  ['맥락을 모아 분석', '커밋·PR·이슈·메일·일정을 하나의 출처 목록으로 정규화하고, 모델은 그 목록만 보고 리포트를 씁니다.'],
  ['출처를 기계적으로 검증', '목록에 없는 출처를 인용한 문장은 자동으로 빠집니다. 확인된 내용과 추론은 항상 구분해 보여줍니다.'],
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="surface scroll-mt-20 p-5 sm:p-7">
      <h2 id="how-heading" className="text-lg font-semibold">어떻게 동작하나요</h2>
      <ol className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="tnum mt-0.5 w-5 shrink-0 text-sm text-text-3">{i + 1}</span>
            <div>
              <div className="text-[15px] font-semibold text-text">{title}</div>
              <p className="mt-1 text-sm leading-relaxed text-text-2">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 text-sm">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-2 hover:text-text">구현 코드 보기 <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
      </div>
    </section>
  );
}
