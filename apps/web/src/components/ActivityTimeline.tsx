import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import { IS_DEMO_BUILD, REPO_URL } from '../lib/client.js';
import { SERVER_COLOR, SERVER_NAME, summaryKo, toolLabel } from '../lib/copy.js';
import type { RunPhase } from '../lib/useAgentRun.js';
import { McpTopology, WireLog, kb } from './McpWire.js';

interface ToolDetail { server: McpServerId; name: string; input: Record<string, unknown>; summary?: string; items?: number; durationMs?: number; error?: string }
interface Step { key: string; label: string; detail?: string; color?: string; tool?: ToolDetail; state: 'done' | 'active' | 'failed'; code?: string }

/** Where each step lives in the source, for readers who want to check. */
const REPO_REF = (import.meta.env['VITE_REPO_REF'] as string | undefined) ?? 'HEAD';
const codeUrl = (path: string) => `${REPO_URL}/blob/${REPO_REF}/${path}`;

/** `query:"bug OR blocked…", limit:20` — the arguments as a short inline summary. */
export function argsSummary(input: Record<string, unknown>, max = 60): string {
  const s = Object.entries(input).map(([k, v]) => `${k}:${typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v)}`).join(', ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Rows a person reads: verbs while running, results when done. Model reasoning is never part of the stream. */
export function stepsFromEvents(events: AgentEvent[], phase: RunPhase): Step[] {
  const steps: Step[] = [];
  const tool = new Map<string, Step>();
  for (const e of events) {
    switch (e.type) {
      case 'agent_run_started': steps.push({ key: 'start', label: '요청 수신', state: 'done', code: 'packages/agent-core/src/agent.ts' }); break;
      case 'tool_discovery_started': steps.push({ key: 'discover', label: '사용할 수 있는 도구를 찾는 중', state: 'active', code: 'packages/agent-core/src/tools/mcp-executor.ts' }); break;
      case 'llm_response': {
        if (!e.toolCalls.length) break;
        const scripted = e.provider === 'scripted';
        steps.push({ key: `plan-${steps.length}`, label: `${scripted ? '실행 계획 (질문별 스크립트 규칙)' : `실행 계획 (${e.model}이 선택)`} · 도구 ${e.toolCalls.length}개`, detail: e.toolCalls.map((t) => t.name.replace('__', '.')).join(', '), state: 'done', code: scripted ? 'packages/agent-core/src/llm/scripted.ts' : 'packages/agent-core/src/agent.ts' });
        break;
      }
      case 'mcp_server_connected': {
        let s = steps.find((x) => x.key === 'connect');
        if (!s) { s = { key: 'connect', label: '', detail: '', state: 'done' }; steps.splice(Math.max(0, steps.findIndex((x) => x.key === 'discover')), 0, s); }
        const names = [...(s.detail ? s.detail.split(' · ') : []), `${e.serverInfo.name} v${e.serverInfo.version}`];
        s.label = `MCP 서버 ${names.length}곳과 연결 (initialize · stdio · MCP ${e.protocolVersion})`;
        s.detail = names.join(' · ');
        break;
      }
      case 'tool_discovered': { const s = steps.find((x) => x.key === 'discover'); if (s) { s.state = 'done'; s.label = `MCP 서버 ${new Set(e.tools.map((t) => t.server)).size}곳에서 도구 ${e.tools.length}개 발견`; } break; }
      case 'tool_call_started': { const s: Step = { key: e.call.id, label: toolLabel(e.call.server, e.call.name, false), color: SERVER_COLOR[e.call.server], tool: { server: e.call.server, name: e.call.name, input: e.call.input }, state: 'active', code: `mcp-servers/${e.call.server}/src/server.ts` }; tool.set(e.call.id, s); steps.push(s); break; }
      case 'tool_call_completed': {
        const s = tool.get(e.call.id);
        if (s && s.tool) {
          const data = e.result.output.data;
          s.state = 'done';
          s.label = toolLabel(e.call.server, e.call.name, true);
          s.detail = summaryKo(e.result.output.summary);
          s.tool = { ...s.tool, summary: e.result.output.summary, durationMs: e.result.durationMs, ...(Array.isArray(data) ? { items: data.length } : {}) };
        }
        break;
      }
      case 'tool_call_failed': { const s = tool.get(e.call.id); if (s && s.tool) { s.state = 'failed'; s.detail = e.result.error.message; s.tool = { ...s.tool, error: e.result.error.message, durationMs: e.result.durationMs }; } break; }
      case 'context_aggregated': steps.push({ key: 'ctx', label: `출처 ${e.totalItems}건으로 맥락 구성`, state: 'done' }); steps.push({ key: 'analyze', label: '리포트 작성 중', state: 'active' }); break;
      case 'report_generated': { const s = steps.find((x) => x.key === 'analyze'); if (s) { s.state = 'done'; s.label = '리포트 완성'; s.detail = `섹션 ${e.report.sections.length}개 · 출처 검증 · 근거 없는 항목 ${e.droppedItems}건 제외`; s.code = 'packages/agent-core/src/report/generate.ts'; } break; }
      case 'agent_run_completed': if (e.status === 'error') { for (const s of steps) if (s.state === 'active') s.state = 'failed'; steps.push({ key: 'end', label: '실행 실패', detail: e.error ?? '', state: 'failed' }); } break;
    }
  }
  if (phase === 'starting' && steps.length === 0) steps.push({ key: 'boot', label: '실행을 준비하는 중', state: 'active' });
  return steps;
}

function ToolStep({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const t = s.tool!;
  return (
    <div className="min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded text-left">
        <span className={`inline-flex items-center gap-2 text-[15px] ${s.state === 'failed' ? 'text-danger' : s.state === 'active' ? 'text-text' : 'text-text-2'}`}>
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />{s.label}
        </span>
        {s.detail && <span className="tnum text-sm text-text">{s.detail}</span>}
        <span className="inline-flex min-w-0 items-center gap-0.5 font-mono text-xs text-text-3"><span className="truncate">{t.name}({argsSummary(t.input)})</span>{t.durationMs !== undefined ? ` · ${t.durationMs}ms` : ''}<ChevronRight className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} aria-hidden /></span>
      </button>
      {open && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-bg px-3 py-2.5 text-xs sm:grid-cols-[88px_minmax(0,1fr)]">
          <dt className="text-text-3">MCP 서버</dt><dd className="text-text">{SERVER_NAME[t.server]} · stdio</dd>
          <dt className="text-text-3">입력</dt><dd className="min-w-0"><pre className="overflow-x-auto font-mono text-[11px] text-text">{Object.keys(t.input).length ? JSON.stringify(t.input, null, 2) : '{} (기본값 사용)'}</pre></dd>
          <dt className="text-text-3">결과</dt><dd className="font-mono text-[11px] text-text">{t.error ?? t.summary ?? '…'}{t.items !== undefined ? ` · 항목 ${t.items}개` : ''}</dd>
          <dt className="text-text-3">소요 시간</dt><dd className="tnum text-text">{t.durationMs !== undefined ? `${t.durationMs}ms (기록 당시 MCP 호출 시간)` : '…'}</dd>
        </dl>
      )}
    </div>
  );
}

function downloadJson(events: AgentEvent[], runId: string | null) {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${runId ?? 'run'}-events.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ActivityTimeline({ events, phase, recorded, runId, headingRef, defaultOpen = false }: { events: AgentEvent[]; phase: RunPhase; recorded: boolean; runId?: string | null; headingRef?: React.Ref<HTMLHeadingElement>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [raw, setRaw] = useState(false);
  const [wire, setWire] = useState(false);
  const steps = stepsFromEvents(events, phase);
  if (phase === 'idle' || (!events.length && phase === 'completed')) return null;
  const done = phase === 'completed';
  const completed = events.filter((e): e is Extract<AgentEvent, { type: 'tool_call_completed' }> => e.type === 'tool_call_completed');
  const servers = [...new Set(completed.map((e) => e.call.server))];
  const mcpMs = completed.reduce((n, e) => n + e.result.durationMs, 0);
  const sources = events.find((e) => e.type === 'context_aggregated');
  const summary = done
    ? `도구 ${completed.length}회 호출 (${servers.map((s) => ({ github: 'GitHub', gmail: 'Gmail', calendar: 'Calendar', lms: 'eCampus' })[s]).join(', ')}) · 출처 ${sources?.type === 'context_aggregated' ? sources.totalItems : 0}건 · MCP 호출 합계 ${mcpMs}ms`
    : '에이전트가 도구를 고르고 MCP로 실행하는 중';
  const expanded = !done || open;
  const wireCount = events.filter((e) => e.type === 'mcp_message').length;

  return (
    <section id="activity" aria-labelledby="activity-heading" className="surface scroll-mt-20 px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="activity-heading" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">에이전트 활동{recorded && <span className="ml-2 text-sm font-normal text-text-3">기록 재생</span>}</h2>
          <p className="tnum mt-0.5 text-sm text-text-2">{summary}</p>
          {IS_DEMO_BUILD && done && <p className="mt-0.5 text-xs text-text-3">도구 선택: 질문별 실행 계획(스크립트) · 재생 속도는 화면 표시용으로 조정됨</p>}
        </div>
        {done && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="activity-list" className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-sm text-text-2 hover:text-text">
            {open ? '접기' : '단계 보기'} <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      <McpTopology events={events} live={!done} recorded={recorded || IS_DEMO_BUILD} />
      {expanded && (
        <>
          <ol id="activity-list" className="mt-4 space-y-2.5">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-3">
                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                  {s.state === 'done' && <Check className="h-4 w-4 text-ok" aria-label="완료" />}
                  {s.state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label="진행 중" />}
                  {s.state === 'failed' && <AlertTriangle className="h-4 w-4 text-danger" aria-label="실패" />}
                </span>
                {s.tool ? <ToolStep s={s} /> : (
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className={`text-[15px] ${s.state === 'failed' ? 'text-danger' : s.state === 'active' ? 'text-text' : 'text-text-2'}`}>{s.label}</span>
                    {s.detail && <span className="tnum min-w-0 break-words text-sm text-text">{s.detail}</span>}
                  </div>
                )}
                {s.code && <a href={codeUrl(s.code)} target="_blank" rel="noreferrer" title={s.code} className="mt-0.5 shrink-0 font-mono text-[11px] text-text-3 hover:text-text max-sm:hidden">코드</a>}
              </li>
            ))}
          </ol>
        </>
      )}
          {done && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-text-3">개발자용 상세</span>
                {wireCount > 0 && (
                  <button type="button" onClick={() => setWire((w) => !w)} aria-expanded={wire} className="inline-flex items-center gap-1 rounded-md py-1.5 text-sm text-text-2 hover:text-text">
                    JSON-RPC 메시지 {wireCount}개 <ChevronDown className={`h-4 w-4 transition ${wire ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                )}
                <button type="button" onClick={() => setRaw((r) => !r)} aria-expanded={raw} aria-controls="raw-events" className="inline-flex items-center gap-1 rounded-md py-1.5 text-sm text-text-2 hover:text-text">
                  원시 이벤트 {events.length}개 <ChevronDown className={`h-4 w-4 transition ${raw ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                <button type="button" onClick={() => downloadJson(events, runId ?? null)} className="inline-flex items-center gap-1 rounded-md py-1.5 text-sm text-text-2 hover:text-text"><Download className="h-3.5 w-3.5" aria-hidden />JSON 내려받기</button>
              </div>
              {wire && <WireLog events={events} />}
              {raw && (
                <div id="raw-events" className="mt-2 max-h-80 overflow-auto rounded-lg bg-bg">
                  <table className="w-full text-left font-mono text-[11px]">
                    <caption className="sr-only">에이전트 이벤트 트레이스</caption>
                    <thead className="sticky top-0 bg-bg text-text-3"><tr><th className="px-3 py-1.5 font-medium">+ms</th><th className="px-3 py-1.5 font-medium">type</th><th className="px-3 py-1.5 font-medium">detail</th></tr></thead>
                    <tbody>
                      {events.map((e, i) => {
                        const t0 = new Date(events[0]!.timestamp).getTime();
                        const detail = 'call' in e ? `${e.call.server}.${e.call.name} ${JSON.stringify(e.call.input)}` : e.type === 'tool_discovered' ? `${e.tools.length} tools` : e.type === 'context_aggregated' ? JSON.stringify(e.counts) : e.type === 'report_generated' ? `${e.report.sections.length} sections, dropped ${e.droppedItems}` : e.type === 'agent_run_completed' ? e.status : e.type === 'tool_discovery_started' ? e.servers.join(',') : e.type === 'mcp_message' ? `${e.direction === 'client_to_server' ? '→' : '←'} ${e.server} ${e.kind} ${e.method ?? ''}${e.rpcId !== undefined ? ` #${e.rpcId}` : ''} ${kb(e.bytes)}` : e.type === 'mcp_server_connected' ? `${e.server}: ${e.serverInfo.name} v${e.serverInfo.version}, MCP ${e.protocolVersion}, ${e.transport}` : e.type === 'llm_request' ? `${e.phase} → ${e.provider}/${e.model} ${kb(e.bytes)}, masked ${e.maskedEmails}, flagged ${e.flagged.length}` : e.type === 'llm_response' ? `${e.provider}: ${e.stopReason}, ${e.toolCalls.length} tool calls` : '';
                        return (
                          <tr key={i} className="border-t border-line/50 align-top">
                            <td className="tnum px-3 py-1 text-text-3">{new Date(e.timestamp).getTime() - t0}</td>
                            <td className="px-3 py-1 text-text">{e.type}</td>
                            <td className="break-all px-3 py-1 text-text-2">{detail}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
    </section>
  );
}
