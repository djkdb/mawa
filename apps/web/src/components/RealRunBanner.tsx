import type { AgentEvent } from '@mawa/shared';
import { IS_DEMO_BUILD } from '../lib/client.js';

/**
 * The provenance line for a real-mode run, for screen recordings:
 * 「실제 실행 · 실제 데이터 · <start> · <provider/model>」.
 * Like ModeBadge it is driven by data — the run's own events — never by a UI switch: it appears only
 * when the run's agent_run_started event says mode "real", and never in the demo build.
 */
export function realRunInfo(events: AgentEvent[]): { startedAt: string; llm: string | null; status: 'running' | 'success' | 'error' } | null {
  if (IS_DEMO_BUILD) return null;
  const started = events.find((e) => e.type === 'agent_run_started');
  if (!started || started.mode !== 'real') return null;
  // Every event of the run carries mode; a single demo event means this is not a clean real run.
  if (events.some((e) => e.mode !== 'real')) return null;
  const llm = [...events].reverse().find((e) => (e.type === 'llm_response' || e.type === 'llm_request') && !e.model.endsWith('-default')) ?? events.find((e) => e.type === 'llm_request');
  const done = events.find((e) => e.type === 'agent_run_completed');
  return {
    startedAt: started.timestamp,
    llm: llm && (llm.type === 'llm_request' || llm.type === 'llm_response') ? `${llm.provider}/${llm.model}` : null,
    status: done?.type === 'agent_run_completed' ? done.status : 'running',
  };
}

const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function RealRunBanner({ events }: { events: AgentEvent[] }) {
  const info = realRunInfo(events);
  if (!info) return null;
  const state = info.status === 'running' ? '진행 중' : info.status === 'success' ? '완료' : '실패';
  return (
    <div data-testid="real-run-banner" className="sticky top-14 z-20 mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-ok/40 bg-surface px-4 py-2 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${info.status === 'error' ? 'bg-danger' : 'bg-ok'}`} aria-hidden />
      <span className="font-semibold text-text">실제 실행 · 실제 데이터 · <time dateTime={info.startedAt} className="tnum">{fmt(info.startedAt)}</time> · <span className="font-mono text-[13px]">{info.llm ?? 'LLM 대기'}</span></span>
      <span className={`ml-auto text-xs ${info.status === 'error' ? 'font-medium text-danger' : 'text-text-3'}`}>{state}</span>
    </div>
  );
}
