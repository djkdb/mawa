import type { AgentEvent } from './events/index.js';
import type { McpServerId } from './mcp/index.js';

export type AuditAction = 'read' | 'denied' | 'adjusted' | 'failed' | 'excluded' | 'llm';

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
  maskedPii?: number;
  piiKinds?: Partial<Record<string, number>>;
  provider?: string;
  /** For llm rows: items whose text looked like instructions to the model (sent as data, flagged). */
  flagged?: string[];
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
    if (e.type === 'tool_call_completed') { const verify = e.call.id.startsWith('verify_'); out.push({ ...base, action: 'read', server: e.call.server, tool: e.call.name, input: e.call.input, rows: rowsOf(e).length, sourceIds: rowsOf(e), durationMs: e.result.durationMs, sentToLlm: verify ? false : sentToLlm, ...(verify ? { detail: '누락 검사 (모델에 보내지 않음)' } : {}) }); }
    else if (e.type === 'tool_call_failed') out.push({ ...base, action: 'failed', server: e.call.server, tool: e.call.name, input: e.call.input, detail: e.result.error.code });
    else if (e.type === 'tool_call_denied') {
      const [server, tool] = e.call.name.split('__') as [McpServerId, string];
      out.push({ ...base, action: 'denied', server, tool, input: e.call.input, detail: e.detail ?? '허용 목록에 없는 도구' });
    } else if (e.type === 'tool_call_adjusted') {
      const [server, tool] = e.call.name.split('__') as [McpServerId, string];
      out.push({ ...base, action: 'adjusted', server, tool, detail: e.changes.join(', ') });
    } else if (e.type === 'policy_applied') for (const x of e.excluded) out.push({ ...base, action: 'excluded', sourceIds: [x.sourceId], detail: `규칙 “${x.rule}”` });
    else if (e.type === 'llm_request') out.push({ ...base, action: 'llm', provider: `${e.provider}/${e.model}`, detail: `${e.phase === 'plan' ? '계획' : '리포트 작성'} · ${e.contents.join(' · ')}`, bytes: e.bytes, maskedEmails: e.maskedEmails, maskedPii: e.maskedPii ?? 0, piiKinds: e.piiKinds ?? {}, flagged: e.flagged.map((f) => f.sourceId), sentToLlm: true });
  }
  return out;
}

