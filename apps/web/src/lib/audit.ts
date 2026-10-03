import type { AgentEvent, McpServerId } from '@mawa/shared';

export type AuditAction = 'read' | 'denied' | 'failed' | 'excluded' | 'llm';

/** One audit row: a data access, a refusal, an exclusion, or a payload sent to the model. */
export interface AuditRow {
  at: string;
  runId: string;
  mode: string;
  action: AuditAction;
  server?: McpServerId;
  tool?: string;
  input?: Record<string, unknown>;
  rows?: number;
  sourceIds?: string[];
  durationMs?: number;
  /** For reads: whether the run sent anything to a model afterwards. For llm rows: always true. */
  sentToLlm?: boolean;
  /** Free-text detail: error code, exclusion rule, payload contents. */
  detail?: string;
  bytes?: number;
  maskedEmails?: number;
  maskedPhones?: number;
  provider?: string;
}

type Done = Extract<AgentEvent, { type: 'tool_call_completed' }>;
export function rowsOf(e: Done): string[] {
  const d = e.result.output.data;
  const rows = Array.isArray(d) ? d : d && typeof d === 'object' ? [d] : [];
  return rows.flatMap((r) => (r && typeof r === 'object' && typeof (r as { sourceId?: unknown }).sourceId === 'string' ? [(r as { sourceId: string }).sourceId] : []));
}

/** Audit rows for one run, built only from its events (same in demo and real mode). */
export function auditRows(events: AgentEvent[]): AuditRow[] {
  const sentToLlm = events.some((e) => e.type === 'llm_request' && e.phase === 'analysis');
  const out: AuditRow[] = [];
  for (const e of events) {
    const base = { at: e.timestamp, runId: e.runId, mode: e.mode };
    if (e.type === 'tool_call_completed') out.push({ ...base, action: 'read', server: e.call.server, tool: e.call.name, input: e.call.input, rows: rowsOf(e).length, sourceIds: rowsOf(e), durationMs: e.result.durationMs, sentToLlm });
    else if (e.type === 'tool_call_failed') out.push({ ...base, action: 'failed', server: e.call.server, tool: e.call.name, input: e.call.input, detail: e.result.error.code });
    else if (e.type === 'tool_call_denied') {
      const [server, tool] = e.call.name.split('__') as [McpServerId, string];
      out.push({ ...base, action: 'denied', server, tool, input: e.call.input, detail: '허용 목록에 없는 도구' });
    } else if (e.type === 'policy_applied') for (const x of e.excluded) out.push({ ...base, action: 'excluded', sourceIds: [x.sourceId], detail: `규칙 “${x.rule}”` });
    else if (e.type === 'llm_request') out.push({ ...base, action: 'llm', provider: `${e.provider}/${e.model}`, detail: `${e.phase === 'plan' ? '계획' : '리포트 작성'} · ${e.contents.join(' · ')}`, bytes: e.bytes, maskedEmails: e.maskedEmails, maskedPhones: e.maskedPhones ?? 0, sentToLlm: true });
  }
  return out;
}

export function auditJsonl(rows: AuditRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

export function downloadText(text: string, filename: string, type = 'application/x-ndjson') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Before/after numbers for the policy comparison. */
export function policyFigures(events: AgentEvent[]) {
  const llm = events.filter((e): e is Extract<AgentEvent, { type: 'llm_request' }> => e.type === 'llm_request');
  const analysis = llm.find((e) => e.phase === 'analysis');
  const pol = events.find((e): e is Extract<AgentEvent, { type: 'policy_applied' }> => e.type === 'policy_applied');
  const sources = events.find((e): e is Extract<AgentEvent, { type: 'report_generated' }> => e.type === 'report_generated')?.report.sources.length ?? 0;
  return {
    reads: events.filter((e) => e.type === 'tool_call_completed').length,
    denied: events.filter((e) => e.type === 'tool_call_denied').length,
    blockedTools: pol?.blockedTools.length ?? 0,
    excluded: pol?.excluded.length ?? 0,
    maskedEmails: Math.max(0, ...llm.map((e) => e.maskedEmails)),
    maskedPhones: Math.max(0, ...llm.map((e) => e.maskedPhones ?? 0)),
    sources,
    analysisBytes: analysis?.bytes ?? 0,
  };
}
