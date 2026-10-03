import { useEffect, useMemo, useState } from 'react';
import { Ban, Download, EyeOff, FileSearch, Send, TriangleAlert } from 'lucide-react';
import type { AgentEvent } from '@mawa/shared';
import { getClient, type RunSummary } from '../lib/client.js';
import { auditJsonl, auditRows, downloadText, type AuditAction, type AuditRow } from '../lib/audit.js';
import { SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { kb } from '../components/McpWire.js';

const ACTION: Record<AuditAction, { label: string; Icon: typeof Send; cls: string }> = {
  read: { label: '읽기', Icon: FileSearch, cls: 'text-text-2' },
  denied: { label: '거절', Icon: Ban, cls: 'text-danger' },
  failed: { label: '실패', Icon: TriangleAlert, cls: 'text-warn' },
  excluded: { label: '제외', Icon: EyeOff, cls: 'text-inferred' },
  llm: { label: 'LLM 전송', Icon: Send, cls: 'text-accent' },
};
const FILTERS: Array<AuditAction | 'all'> = ['all', 'read', 'llm', 'denied', 'excluded', 'failed'];
const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/**
 * Every data access across runs in one table: what was read through which MCP tool, what the policy
 * refused or left out, and what was sent to the model (with masking counts). Built from run events.
 */
export function AuditPage() {
  const [runs, setRuns] = useState<Array<{ summary: RunSummary; events: AgentEvent[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditAction | 'all'>('all');
  const [runFilter, setRunFilter] = useState<string>('all');

  useEffect(() => {
    let live = true;
    (async () => {
      const client = getClient();
      const list = (await client.listRuns()).filter((r) => r.status !== 'running').slice(0, 20);
      const seen = new Set<string>();
      const loaded: Array<{ summary: RunSummary; events: AgentEvent[] }> = [];
      for (const s of list) {
        const rec = await client.fetchRun(s.runId).catch(() => null);
        const events = rec?.events ?? [];
        const id = events[0]?.runId ?? s.runId;
        if (!events.length || seen.has(id)) continue;
        seen.add(id);
        loaded.push({ summary: s, events });
      }
      if (live) setRuns(loaded);
    })().catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const all = useMemo(() => (runs ?? []).flatMap((r) => auditRows(r.events).map((row) => ({ row, run: r.summary }))), [runs]);
  const rows = all.filter(({ row }) => (filter === 'all' || row.action === filter) && (runFilter === 'all' || row.runId === runFilter));
  const count = (a: AuditAction) => all.filter(({ row }) => row.action === a && (runFilter === 'all' || row.runId === runFilter)).length;
  const sent = all.filter(({ row }) => row.action === 'llm' && (runFilter === 'all' || row.runId === runFilter)).map(({ row }) => row);
  const masked = sent.reduce((n, r) => n + (r.maskedEmails ?? 0) + (r.maskedPhones ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-4 max-w-3xl text-sm text-text-2">에이전트가 MCP로 읽은 데이터, 정책이 거절하거나 뺀 것, LLM에 보낸 요청을 실행마다 한 줄씩 남깁니다. 실행 이벤트로만 만들기 때문에 데모와 실제 모드가 같은 형식입니다.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!runs && !error && <p className="text-sm text-text-3">불러오는 중…</p>}
      {runs && (
        <section aria-labelledby="audit-heading" className="surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h2 id="audit-heading" className="text-[15px] font-semibold">감사 로그</h2>
            <p className="tnum text-sm text-text-2">실행 {runFilter === 'all' ? runs.length : 1}건 · 읽기 {count('read')} · LLM 전송 {count('llm')} ({kb(sent.reduce((n, r) => n + (r.bytes ?? 0), 0))}) · 가림 {masked} · 거절 {count('denied')} · 제외 {count('excluded')}</p>
            <button type="button" onClick={() => downloadText(auditJsonl(rows.map((r) => r.row)), 'audit-log.jsonl')} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-text-2 hover:text-text"><Download className="h-3.5 w-3.5" aria-hidden />JSONL 내려받기</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <div role="group" aria-label="동작" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs ${filter === f ? 'bg-accent-2 text-text' : 'bg-surface-2 text-text-2 hover:text-text'}`}>
                  {f === 'all' ? '전체' : ACTION[f].label}{f !== 'all' && <span className="tnum text-text-3">{count(f)}</span>}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 text-xs text-text-3">실행
              <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)} className="hairline min-h-8 max-w-[16rem] rounded-md bg-bg px-2 text-xs text-text">
                <option value="all">전체</option>
                {runs.map((r) => <option key={r.events[0]!.runId} value={r.events[0]!.runId}>{r.summary.prompt.slice(0, 28)}{r.summary.kind ? ` (${r.summary.kind})` : ''}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <caption className="sr-only">감사 로그</caption>
              <thead className="text-xs text-text-3">
                <tr><th className="py-2 pr-3 font-medium">시각</th><th className="py-2 pr-3 font-medium">동작</th><th className="py-2 pr-3 font-medium">대상</th><th className="py-2 pr-3 font-medium">내용</th><th className="py-2 pr-3 text-right font-medium">행·크기</th><th className="py-2 font-medium">실행</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 400).map(({ row, run }, i) => <Row key={i} row={row} run={run} />)}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-center text-sm text-text-3">해당하는 기록이 없습니다.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ row, run }: { row: AuditRow; run: RunSummary }) {
  const a = ACTION[row.action];
  const target = row.server ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERVER_COLOR[row.server] }} aria-hidden /><span className="font-mono text-xs text-text">{row.tool}</span><span className="text-xs text-text-3">{SERVER_NAME[row.server]}</span></span>
    : row.action === 'llm' ? <span className="font-mono text-xs text-text">{row.provider}</span>
    : <span className="font-mono text-xs text-text-2">{row.sourceIds?.[0]}</span>;
  const content = row.action === 'read' ? (Object.keys(row.input ?? {}).length ? JSON.stringify(row.input) : '기본 인자')
    : row.action === 'llm' ? `${row.detail} · 메일 주소 ${row.maskedEmails ?? 0} · 전화·학번 ${row.maskedPhones ?? 0} 가림`
    : row.action === 'denied' ? `${row.detail} · ${JSON.stringify(row.input)}` : row.detail ?? '';
  const size = row.action === 'read' ? `${row.rows}개 · ${row.durationMs}ms` : row.action === 'llm' ? kb(row.bytes ?? 0) : '';
  return (
    <tr className="border-t border-line/70 align-top">
      <td className="tnum whitespace-nowrap py-2 pr-3 text-xs text-text-3">{time(row.at)}</td>
      <td className="whitespace-nowrap py-2 pr-3"><span className={`inline-flex items-center gap-1 text-xs font-medium ${a.cls}`}><a.Icon className="h-3.5 w-3.5" aria-hidden />{a.label}</span></td>
      <td className="py-2 pr-3">{target}</td>
      <td className="max-w-[22rem] py-2 pr-3 text-xs text-text-2"><span className="line-clamp-2 break-all">{content}</span></td>
      <td className="tnum whitespace-nowrap py-2 pr-3 text-right text-xs text-text-2">{size}</td>
      <td className="py-2 text-xs"><a href={hrefFor('report', run.runId)} className="line-clamp-1 text-accent hover:underline">{run.prompt.slice(0, 20)}</a></td>
    </tr>
  );
}
