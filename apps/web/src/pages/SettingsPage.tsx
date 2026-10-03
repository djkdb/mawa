import { IS_DEMO_BUILD, REPO_URL, type Status } from '../lib/client.js';

export function SettingsPage({ status }: { status: Status | null }) {
  const rows: Array<[string, string]> = [
    ['데이터 모드', IS_DEMO_BUILD ? '데모 워크스페이스 · 샘플 데이터 (기록된 실행 재생)' : status?.defaultMode === 'real' ? '실제 데이터' : '데모 · 샘플 데이터'],
    ['모델', IS_DEMO_BUILD ? '사용 안 함 · 기록은 질문별 실행 계획(scripted-heuristics-v1)으로 생성' : status ? (status.llm.isModel ? `${status.llm.provider} · ${status.llm.model} (모델이 도구를 직접 선택)` : '없음 · 규칙 기반 생성기 (LLM_API_KEY 미설정)') : '…'],
    ['도구 선택', IS_DEMO_BUILD ? '질문별 고정 계획 · 실제 모드에서는 LLM이 발견된 도구 중에서 선택' : status?.llm.isModel ? 'LLM이 발견된 MCP 도구 중에서 선택' : '규칙 기반 계획'],
    ['실행 기록 보관', IS_DEMO_BUILD ? '이 브라우저 탭에서만 유지' : status?.tokenStore.persistent ? '서버 메모리 (최근 50건)' : '서버 메모리 (최근 50건)'],
    ['토큰 보관', IS_DEMO_BUILD ? '해당 없음' : status?.tokenStore.persistent ? '서버에서 AES-256-GCM 암호화 저장' : '서버 메모리 (SESSION_ENCRYPTION_KEY 미설정)'],
    ['권한', '읽기 전용 API 호출만 수행 · 쓰기 도구 없음'],
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
      <p className="mt-4 text-[13px] text-text-3">구현 코드: <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-text-2 hover:text-text">{REPO_URL.replace('https://', '')}</a></p>
    </div>
  );
}
