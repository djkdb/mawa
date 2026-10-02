import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2 } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { SERVER_COLOR, summaryKo, toolLabel } from '../lib/copy.js';
import type { RunPhase } from '../lib/useAgentRun.js';

interface Step { key: string; label: string; detail?: string; mono?: string; color?: string; state: 'done' | 'active' | 'failed' }

/** Rows a person reads: verbs while running, results when done. Reasoning is never part of the stream. */
export function stepsFromEvents(events: AgentEvent[], phase: RunPhase): Step[] {
  const steps: Step[] = [];
  const tool = new Map<string, Step>();
  for (const e of events) {
    switch (e.type) {
      case 'agent_run_started': steps.push({ key: 'start', label: '요청을 이해했습니다', state: 'done' }); break;
      case 'tool_discovery_started': steps.push({ key: 'discover', label: '사용할 수 있는 도구를 찾는 중', state: 'active' }); break;
      case 'tool_discovered': { const s = steps.find((x) => x.key === 'discover'); if (s) { s.state = 'done'; s.label = `MCP 서버 ${new Set(e.tools.map((t) => t.server)).size}곳에서 도구 ${e.tools.length}개 발견`; } break; }
      case 'tool_call_started': { const s: Step = { key: e.call.id, label: toolLabel(e.call.server, e.call.name, false), mono: `${e.call.name}()`, color: SERVER_COLOR[e.call.server], state: 'active' }; tool.set(e.call.id, s); steps.push(s); break; }
      case 'tool_call_completed': { const s = tool.get(e.call.id); if (s) { s.state = 'done'; s.label = toolLabel(e.call.server, e.call.name, true); s.detail = summaryKo(e.result.output.summary); } break; }
      case 'tool_call_failed': { const s = tool.get(e.call.id); if (s) { s.state = 'failed'; s.detail = e.result.error.message; } break; }
      case 'context_aggregated': steps.push({ key: 'ctx', label: `출처 ${e.totalItems}건으로 맥락 구성`, state: 'done' }); steps.push({ key: 'analyze', label: '리포트 작성 중', state: 'active' }); break;
      case 'report_generated': { const s = steps.find((x) => x.key === 'analyze'); if (s) { s.state = 'done'; s.label = '리포트 완성'; s.detail = `섹션 ${e.report.sections.length}개 · 출처 검증 통과${e.droppedItems ? ` · 근거 없는 항목 ${e.droppedItems}건 제외` : ''}`; } break; }
      case 'agent_run_completed': if (e.status === 'error') { for (const s of steps) if (s.state === 'active') s.state = 'failed'; steps.push({ key: 'end', label: '실행 실패', detail: e.error ?? '', state: 'failed' }); } break;
    }
  }
  if (phase === 'starting' && steps.length === 0) steps.push({ key: 'boot', label: '실행을 준비하는 중', state: 'active' });
  return steps;
}

export function ActivityTimeline({ events, phase, recorded }: { events: AgentEvent[]; phase: RunPhase; recorded: boolean }) {
  const [open, setOpen] = useState(false);
  const steps = stepsFromEvents(events, phase);
  if (phase === 'idle') return null;
  const done = phase === 'completed';
  const calls = events.filter((e) => e.type === 'tool_call_completed').length;
  const servers = new Set(events.flatMap((e) => (e.type === 'tool_call_completed' ? [e.call.server] : [])));
  const sources = events.find((e) => e.type === 'context_aggregated');
  const a = events[0]?.timestamp; const b = events.at(-1)?.timestamp;
  const secs = a && b ? ((new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(1) : null;
  const expanded = !done || open;
  const summary = done
    ? `도구 ${calls}회 호출 (${[...servers].map((s) => ({ github: 'GitHub', gmail: 'Gmail', calendar: 'Calendar' })[s]).join(', ')}) · 출처 ${sources?.type === 'context_aggregated' ? sources.totalItems : 0}건${secs ? ` · ${secs}초` : ''}`
    : '에이전트가 도구를 고르고 MCP로 실행하는 중';

  return (
    <section id="activity" aria-labelledby="activity-heading" className="surface scroll-mt-20 px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="activity-heading" className="text-[15px] font-semibold">에이전트 활동{recorded && <span className="ml-2 text-sm font-normal text-text-3">기록 재생</span>}</h2>
          <p className="tnum mt-0.5 truncate text-sm text-text-2">{summary}</p>
        </div>
        {done && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="activity-list" className="inline-flex shrink-0 items-center gap-1 text-sm text-text-2 hover:text-text">
            {open ? '접기' : '단계 보기'} <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      {expanded && (
        <ol id="activity-list" className="mt-4 space-y-2.5" aria-live="polite" aria-relevant="additions text">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                {s.state === 'done' && <Check className="h-4 w-4 text-ok" aria-label="완료" />}
                {s.state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label="진행 중" />}
                {s.state === 'failed' && <AlertTriangle className="h-4 w-4 text-rose-300" aria-label="실패" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={`inline-flex items-center gap-2 text-[15px] ${s.state === 'failed' ? 'text-rose-200' : s.state === 'active' ? 'text-text' : 'text-text-2'}`}>{s.color && <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />}{s.label}</span>
                {s.detail && <span className="tnum text-sm text-text">{s.detail}</span>}
                {s.mono && <span className="font-mono text-xs text-text-3">{s.mono}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
