import { useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { SERVER_COLOR, SERVER_NAME, piiBreakdown } from '../lib/copy.js';
import { kb } from './McpWire.js';
import { auditJsonl, auditRows, downloadText, rowsOf } from '../lib/audit.js';

type LlmReq = Extract<AgentEvent, { type: 'llm_request' }>;
type Done = Extract<AgentEvent, { type: 'tool_call_completed' }>;
type Denied = Extract<AgentEvent, { type: 'tool_call_denied' }>;

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
  const denied = events.filter((e): e is Denied => e.type === 'tool_call_denied');
  const phones = Math.max(0, ...llm.map((e) => e.maskedPii ?? 0));
  const kinds = llm.reduce<Record<string, number>>((acc, e) => { for (const [k, n] of Object.entries(e.piiKinds ?? {})) acc[k] = Math.max(acc[k] ?? 0, n ?? 0); return acc; }, {});
  const download = () => downloadText(auditJsonl(auditRows(events)), `${runId ?? 'run'}-data-access.jsonl`);

  return (
    <section aria-labelledby="datause-heading" className="surface px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="datause-heading" className="text-[15px] font-semibold">데이터 사용 내역</h2>
          <p className="tnum mt-0.5 text-sm text-text-2">읽기 {calls.length}회 · 항목 {rows}개 · LLM 요청 {llm.length}회 · 메일 주소 {masked}개 · 개인정보 {phones}개 가림{phones ? ` (${piiBreakdown(kinds)})` : ''}{denied.length ? ` · 거절한 호출 ${denied.length}건` : ''}{flagged.size ? ` · 지시문 감지 ${flagged.size}건` : ''}</p>
          {pol && (
            <p className="mt-1 text-[13px] text-text-2">
              <span className="mr-1.5 rounded bg-accent-2/70 px-1.5 py-0.5 text-[11px] font-medium text-text">정책</span>
              제외 규칙 {pol.policy.exclude.length ? pol.policy.exclude.map((x) => `“${x}”`).join(', ') : '없음'} · 메일 주소 가리기 {pol.policy.maskEmails ? '켬' : '끔'} · 개인정보 가리기 {pol.policy.maskPii !== false ? '켬' : '끔'}{pol.policy.allowedTools ? ` · 허용 도구 ${pol.policy.allowedTools.length}개` : ''}
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
            {denied.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-text-2">정책이 거절한 호출</h3>
                <ul className="mt-2 space-y-1 rounded-lg bg-bg px-3 py-2 font-mono text-[11px] text-text-3">
                  {denied.map((d) => <li key={d.call.id}>{d.call.name.replace('__', '.')} {JSON.stringify(d.call.input)} · 허용 목록에 없음</li>)}
                </ul>
                <p className="mt-1 text-xs text-text-3">요청은 MCP 서버로 가지 않았고, 모델에게는 거절됐다고 알렸습니다.</p>
              </div>
            )}
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
                  <div className="mt-1 text-xs text-text-3">메일 주소 {e.maskedEmails}개 · 개인정보 {e.maskedPii ?? 0}개 가림{e.maskedPii ? ` (${piiBreakdown(e.piiKinds)})` : ''}{e.flagged.length ? ` · 지시문 감지: ${e.flagged.map((f) => `${f.sourceId} (${f.reason})`).join(', ')}` : ''}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
