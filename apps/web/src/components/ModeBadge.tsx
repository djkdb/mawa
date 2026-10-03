import type { AgentMode } from '@mawa/shared';

/** Driven by data (event/report `mode`), never by a UI flag. */
export function ModeBadge({ mode }: { mode: AgentMode }) {
  const demo = mode === 'demo';
  return (
    <span className={`tag whitespace-nowrap ${demo ? 'bg-caution/15 text-warn' : 'bg-ok/15 text-ok'}`} title={demo ? '실제 계정 대신 샘플(합성) 데이터를 사용합니다.' : '연결된 계정의 실제 데이터를 사용합니다.'}>
      <span className={`h-1.5 w-1.5 rounded-full ${demo ? 'bg-caution' : 'bg-ok'}`} aria-hidden />
      <span className="hidden sm:inline">{demo ? '데모 워크스페이스 · 샘플 데이터' : '실제 데이터'}</span><span className="sm:hidden">{demo ? '샘플 데이터' : '실제'}</span>
    </span>
  );
}
