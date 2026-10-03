import { ArrowUpRight } from 'lucide-react';
import { IS_DEMO_BUILD, REPO_URL } from '../lib/client.js';

const STEPS: Array<[string, string]> = [
  ['소스를 MCP로 연결', 'MCP(Model Context Protocol)는 AI가 외부 도구를 쓰는 표준 규격입니다. GitHub, Gmail, Google Calendar가 각각 독립된 MCP 서버로 붙고, 에이전트는 서버가 공개한 도구 목록만 봅니다.'],
  ['필요한 도구를 고름', '실제 모드에서는 LLM이 발견된 도구 목록을 보고 질문에 필요한 도구를 직접 고릅니다. 고정 규칙은 없습니다.'],
  ['맥락을 모아 분석', '커밋·PR·이슈·메일·일정을 하나의 출처 목록으로 모으고, 리포트는 그 목록만 보고 작성합니다.'],
  ['출처를 기계적으로 검증', '목록에 없는 출처를 인용한 문장은 자동으로 빠집니다. 출처에서 직접 확인한 내용과 추론한 내용은 항상 구분해 보여줍니다.'],
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="surface p-5 sm:p-7">
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
      {IS_DEMO_BUILD && (
        <p className="mt-5 rounded-lg bg-caution/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
          이 데모의 기록은 LLM 대신 <b>질문별로 정해 둔 실행 계획(scripted-heuristics-v1)</b>으로 만들었습니다. MCP 서버 호출, 출처 수집, 출처 검증은 실제 코드 그대로 거쳤고, 데이터는 가상의 demo-user 계정입니다. LLM이 도구를 직접 고르는 실행은 API 서버에 키를 넣고 실행할 때 볼 수 있습니다.
        </p>
      )}
      <div className="mt-6 text-sm">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-2 hover:text-text">구현 코드 보기 <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
      </div>
    </section>
  );
}
