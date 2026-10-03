import { IS_DEMO_BUILD, REPO_URL, type Status } from '../lib/client.js';
import { PolicyEditor } from '../components/PolicyEditor.js';

export function SettingsPage({ status }: { status: Status | null }) {
  const rows: Array<[string, string]> = [
    ['데이터 모드', IS_DEMO_BUILD ? '데모 워크스페이스 · 샘플 데이터 (기록된 실행 재생)' : status?.defaultMode === 'real' ? '실제 데이터' : '데모 · 샘플 데이터'],
    ['모델', IS_DEMO_BUILD ? '사용 안 함 · 기록은 질문별 실행 계획(scripted-heuristics-v1)으로 생성' : status ? (status.llm.isModel ? `${status.llm.provider === 'claude-cli' ? 'Claude Code CLI' : status.llm.provider} · ${status.llm.model === 'claude-cli-default' ? '로그인된 계정의 기본 모델' : status.llm.model} (모델이 도구를 직접 선택)` : '없음 · 규칙 기반 생성기 (LLM_API_KEY 미설정)') : '…'],
    ['도구 선택', IS_DEMO_BUILD ? '질문별 고정 계획 · 실제 모드에서는 LLM이 발견된 도구 중에서 선택' : status?.llm.isModel ? 'LLM이 발견된 MCP 도구 중에서 선택' : '규칙 기반 계획'],
    ['실행 기록 보관', IS_DEMO_BUILD ? '이 브라우저에 실행 목록과 숨긴 항목만 저장 (localStorage)' : status?.runStore?.persistent ? '서버 파일에 암호화 저장 (최근 30건, 지난 실행 비교에 사용) · 실행마다 감사 로그(JSONL) 내려받기 가능' : '서버 메모리 (최근 50건, 재시작하면 사라짐 · SESSION_ENCRYPTION_KEY를 설정하면 암호화 저장) · 감사 로그(JSONL) 내려받기 가능'],
    ['정책 한도', '도구 호출 최대 12회 · 계획 턴 최대 4회 · 도구 결과는 12,000자까지만 LLM에 전달'],
    ['LLM에 보내는 데이터', '메일 주소는 가려서(m***@domain) 보냄 · 메일 본문 대신 요약과 미리보기만 · 메일·이슈 속 지시문은 감지해 데이터로만 처리'],
    ['API 접근', IS_DEMO_BUILD ? '해당 없음 (API 서버 없음)' : `${status?.api?.host === '127.0.0.1' ? '이 컴퓨터에서만 접속 (127.0.0.1)' : `${status?.api?.host ?? '…'}에 바인딩`} · 다른 출처의 요청 차단${status?.api?.tokenRequired ? ' · 접근 토큰 필요' : ''}`],
    ['토큰 보관', IS_DEMO_BUILD ? '해당 없음' : status?.tokenStore.persistent ? '서버에서 AES-256-GCM 암호화 저장' : '서버 메모리 (SESSION_ENCRYPTION_KEY 미설정)'],
    ['권한', '읽기 API만 호출 · 모든 MCP 도구가 readOnlyHint로 선언됨 · 쓰기 도구 없음 (토큰 권한은 연결 화면 참고)'],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <dl className="surface divide-y divide-line/60">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[160px_1fr]">
            <dt className="text-sm text-text-3">{k}</dt>
            <dd className="text-sm text-text">{v}</dd>
          </div>
        ))}
      </dl>
      <PolicyEditor />
      <p className="mt-4 text-[13px] text-text-3">구현 코드: <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-text-2 hover:text-text">{REPO_URL.replace('https://', '')}</a></p>
    </div>
  );
}
