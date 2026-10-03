import { useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';
import { kb } from './McpWire.js';

type LlmReq = Extract<AgentEvent, { type: 'llm_request' }>;
type Done = Extract<AgentEvent, { type: 'tool_call_completed' }>;

function rowsOf(e: Done): string[] {
  const d = e.result.output.data;
  const rows = Array.isArray(d) ? d : d && typeof d === 'object' ? [d] : [];
  return rows.flatMap((r) => (r && typeof r === 'object' && typeof (r as { sourceId?: unknown }).sourceId === 'string' ? [(r as { sourceId: string }).sourceId] : []));
}

/** One JSON line per data access: what was read, from where, and whether it went to the LLM. */
function auditLines(events: AgentEvent[]): string {
  const sentToLlm = events.some((e) => e.type === 'llm_request' && e.phase === 'analysis');
  return events
    .flatMap((e): Array<Record<string, unknown>> => {
      if (e.type === 'tool_call_completed') return [{ at: e.timestamp, runId: e.runId, mode: e.mode, action: 'tools/call', server: e.call.server, tool: e.call.name, input: e.call.input, rows: rowsOf(e).length, sourceIds: rowsOf(e), durationMs: e.result.durationMs, sentToLlm }];
      if (e.type === 'tool_call_failed') return [{ at: e.timestamp, runId: e.runId, mode: e.mode, action: 'tools/call', server: e.call.server, tool: e.call.name, input: e.call.input, error: e.result.error.code }];
      if (e.type === 'llm_request') return [{ at: e.timestamp, runId: e.runId, mode: e.mode, action: 'llm_request', phase: e.phase, provider: e.provider, model: e.model, bytes: e.bytes, contents: e.contents, fields: e.fields, maskedEmails: e.maskedEmails, flagged: e.flagged }];
      return [];
    })
    .map((x) => JSON.stringify(x))
    .join('\n');
}

/**
 * What this run read and what it sent to the model: per tool call (server, arguments, rows, source ids)
 * and per LLM request (size, contents, fields, masked addresses, flagged instructions).
 * Built only from the run's events, so it is the same in demo and real mode.
 */
export function DataUsePanel({ events, runId }: { events: AgentEvent[]; runId: string | null }) {
  const [open, setOpen] = useState(false);
  const calls = events.filter((e): e is Done => e.type === 'tool_call_completed');
  const llm = events.filter((e): e is LlmReq => e.type === 'llm_request');
  if (!calls.length && !llm.length) return null;
  const rows = calls.reduce((n, e) => n + rowsOf(e).length, 0);
  const masked = Math.max(0, ...llm.map((e) => e.maskedEmails));
  const flagged = new Map(llm.flatMap((e) => e.flagged).map((f) => [f.sourceId, f.reason]));
  const scripted = llm.every((e) => e.provider === 'scripted');
  const pol = events.find((e): e is Extract<AgentEvent, { type: 'policy_applied' }> => e.type === 'policy_applied');
  const download = () => {
    const blob = new Blob([auditLines(events)], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${runId ?? 'run'}-data-access.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section aria-labelledby="datause-heading" className="surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="datause-heading" className="text-[15px] font-semibold">데이터 사용 내역</h2>
          <p className="tnum mt-0.5 text-sm text-text-2">읽기 {calls.length}회 · 항목 {rows}개 · LLM 요청 {llm.length}회 · 메일 주소 {masked}개 가림{flagged.size ? ` · 지시문 감지 ${flagged.size}건` : ''}</p>
          {pol && (
            <p className="mt-1 text-[13px] text-text-2">
              <span className="mr-1.5 rounded bg-accent-2/70 px-1.5 py-0.5 text-[11px] font-medium text-text">정책</span>
              제외 규칙 {pol.policy.exclude.length ? pol.policy.exclude.map((x) => `“${x}”`).join(', ') : '없음'} · 메일 주소 가리기 {pol.policy.maskEmails ? '켬' : '끔'}{pol.policy.allowedTools ? ` · 허용 도구 ${pol.policy.allowedTools.length}개` : ''}
              {' · '}<b className="font-semibold text-text">LLM·리포트에서 제외 {pol.excluded.length}건</b>{pol.blockedTools.length ? ` · 막은 도구 ${pol.blockedTools.length}개` : ''}
            </p>
          )}
          <p className="mt-0.5 text-xs text-text-3">쓰기 도구는 없습니다. LLM에는 메일 주소를 가린 요약과 필드만 보내고, 메일·이슈 본문 속 지시문은 데이터로만 다룹니다.{scripted ? ' 이 실행의 LLM 자리에는 스크립트(scripted-heuristics-v1)가 있어 외부로 나간 데이터는 없습니다.' : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={download} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-text-2 hover:text-text"><Download className="h-3.5 w-3.5" aria-hidden />감사 로그(JSONL)</button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="datause-body" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-text-2 hover:text-text">{open ? '접기' : '자세히'}<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden /></button>
        </div>
      </div>
      {open && (
        <div id="datause-body" className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-2">MCP로 읽은 데이터</h3>
            <ul className="mt-2 divide-y divide-line/60 rounded-lg bg-bg text-[13px]">
              {calls.map((e) => (
                <li key={e.call.id} className="flex min-w-0 items-baseline gap-2 px-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERVER_COLOR[e.call.server] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-text">{e.call.name}</span>
                    <span className="block truncate font-mono text-[11px] text-text-3">{SERVER_NAME[e.call.server]} · {Object.keys(e.call.input).length ? JSON.stringify(e.call.input) : '기본 인자'}</span>
                  </span>
                  <span className="tnum shrink-0 text-text-2">{rowsOf(e).length}개</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            {pol && pol.excluded.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-text-2">정책으로 뺀 항목</h3>
                <ul className="mt-2 space-y-1 rounded-lg bg-bg px-3 py-2 font-mono text-[11px] text-text-3">
                  {pol.excluded.map((x) => <li key={x.sourceId}>{x.sourceId} · 규칙 “{x.rule}”</li>)}
                </ul>
                <p className="mt-1 text-xs text-text-3">MCP 서버에서는 읽었지만 LLM 요청과 리포트에는 들어가지 않았습니다.</p>
              </div>
            )}
            <h3 className="text-sm font-medium text-text-2">LLM에 보낸 것</h3>
            <ul className="mt-2 space-y-2">
              {llm.map((e, i) => (
                <li key={i} className="rounded-lg bg-bg px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-text">{e.phase === 'plan' ? '계획 요청' : '리포트 작성 요청'}</span>
                    <span className="tnum font-mono text-[11px] text-text-3">{e.provider}/{e.model} · {kb(e.bytes)}</span>
                  </div>
                  <div className="mt-1 text-text-2">{e.contents.join(' · ')}</div>
                  {e.fields.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.fields.map((f) => <span key={f} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-3">{f}</span>)}</div>}
                  <div className="mt-1 text-xs text-text-3">메일 주소 {e.maskedEmails}개 가림{e.flagged.length ? ` · 지시문 감지: ${e.flagged.map((f) => `${f.sourceId} (${f.reason})`).join(', ')}` : ''}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
