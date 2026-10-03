import { useRef, useState } from 'react';
import { ArrowRight, CalendarDays, GitBranch, Mail } from 'lucide-react';
import type { AgentMode, McpServerId } from '@mawa/shared';
import { DEMO_EXAMPLES, IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { EXAMPLE_META, SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';

const ICON: Record<McpServerId, React.ReactNode> = { github: <GitBranch className="h-3.5 w-3.5" aria-hidden />, gmail: <Mail className="h-3.5 w-3.5" aria-hidden />, calendar: <CalendarDays className="h-3.5 w-3.5" aria-hidden /> };

export function PromptPanel({ status, busy, onRun, progress = null }: { status: Status | null; busy: boolean; onRun: (prompt: string, mode: AgentMode) => void; progress?: string | null }) {
  const [selected, setSelected] = useState<string>(DEMO_EXAMPLES[0]?.id ?? '');
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<AgentMode>('demo');
  const realAvailable = !IS_DEMO_BUILD && (status?.realMode.available ?? false);
  const prompt = selected ? (DEMO_EXAMPLES.find((e) => e.id === selected)?.prompt ?? '') : custom;
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: one tab stop for the group, arrows move focus and selection (WAI-ARIA radio group).
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = DEMO_EXAMPLES.length;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setSelected(DEMO_EXAMPLES[next]!.id);
    radios.current[next]?.focus();
  };
  const activeIndex = Math.max(0, DEMO_EXAMPLES.findIndex((e) => e.id === selected));

  return (
    <section id="ask" aria-labelledby="ask-heading" className="surface scroll-mt-20 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ask-heading" className="text-lg font-semibold">새 리포트 만들기</h2>
        <span className="text-sm text-text-3">질문을 고르고 실행하세요 · 방향키로 선택</span>
      </div>

      <div role="radiogroup" aria-label="질문 선택" className="mt-4 grid gap-2 sm:grid-cols-3">
        {DEMO_EXAMPLES.map((ex, i) => {
          const meta = EXAMPLE_META[ex.id] ?? { title: ex.prompt, hint: '', uses: [] as McpServerId[] };
          const active = ex.id === selected;
          return (
            <button key={ex.id} ref={(el) => { radios.current[i] = el; }} type="button" role="radio" aria-checked={active} tabIndex={i === activeIndex ? 0 : -1} onKeyDown={(e) => onKey(e, i)} disabled={busy} onClick={() => setSelected(ex.id)} className={`flex flex-col items-start gap-1.5 rounded-lg p-4 text-left transition disabled:opacity-60 ${active ? 'bg-surface-2 ring-1 ring-accent' : 'bg-bg/60 hover:bg-surface-2'}`}>
              <span className="text-[15px] font-semibold leading-snug text-text">{meta.title}</span>
              <span className="text-[13px] leading-relaxed text-text-2">{meta.hint}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
                {meta.uses.map((s) => <span key={s} className="inline-flex items-center gap-1"><span style={{ color: SERVER_COLOR[s] }}>{ICON[s]}</span>{SERVER_NAME[s]}</span>)}
              </span>
            </button>
          );
        })}
      </div>

      {IS_DEMO_BUILD ? (
        <div className="mt-4">
          <label htmlFor="prompt" className="text-sm text-text-2">직접 입력</label>
          <textarea id="prompt" rows={1} disabled placeholder="예: 이번 주 리뷰 요청받은 PR만 정리해줘" aria-describedby="prompt-demo-note" className="hairline mt-1.5 w-full resize-none rounded-lg bg-bg px-4 py-3 text-[15px] opacity-60 outline-none placeholder:text-text-3" />
          <p id="prompt-demo-note" className="mt-1 text-xs text-text-3">데모는 기록된 질문 3개만 재생합니다. 자유 질문은 API 서버와 LLM 키를 설정한 실제 실행에서 됩니다.</p>
        </div>
      ) : (
        <div className="mt-4">
          <label htmlFor="prompt" className="text-sm text-text-2">직접 입력</label>
          <textarea id="prompt" value={custom} onChange={(e) => { setCustom(e.target.value); setSelected(''); }} rows={2} disabled={busy} placeholder="예: 이번 주 리뷰 요청받은 PR만 정리해줘" className="hairline mt-1.5 w-full resize-none rounded-lg bg-bg px-4 py-3 text-[15px] text-text outline-none placeholder:text-text-3 disabled:opacity-60" />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={() => onRun(prompt.trim(), mode)} disabled={busy || prompt.trim().length === 0} className="inline-flex items-center gap-2 rounded-lg bg-accent-strong px-5 py-3 text-[15px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? `실행 중… ${progress ?? ''}` : '에이전트 실행'} {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
        {!IS_DEMO_BUILD && (
          <div role="radiogroup" aria-label="모드" className="hairline flex rounded-lg p-0.5 text-sm">
            {(['demo', 'real'] as const).map((m) => {
              const disabled = m === 'real' && !realAvailable;
              return (
                <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy || disabled} onClick={() => setMode(m)} title={disabled ? '실제 모드는 GitHub 또는 Google을 연결해야 합니다' : undefined} className={`rounded-md px-3 py-1.5 font-medium transition ${mode === m ? 'bg-surface-2 text-text' : 'text-text-2 hover:text-text'} disabled:cursor-not-allowed disabled:opacity-40`}>
                  {m === 'demo' ? '데모' : '실제'}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[13px] text-text-3">
          {IS_DEMO_BUILD ? '데모 워크스페이스: 샘플 데이터로 기록된 실행을 재생합니다. 외부 서비스에는 접속하지 않습니다.' : mode === 'demo' ? '실제 계정 대신 샘플 데이터를 사용합니다.' : `연결된 서비스(${status?.realMode.servers.join(', ')})의 데이터를 읽습니다.`}
        </p>
      </div>
    </section>
  );
}
