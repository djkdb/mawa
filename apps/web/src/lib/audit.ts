import type { AgentEvent } from '@mawa/shared';
import type { AuditRow } from '@mawa/shared';

export { auditRows, rowsOf, type AuditAction, type AuditRow } from '@mawa/shared';

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
    maskedPii: Math.max(0, ...llm.map((e) => e.maskedPii ?? 0)),
    pseudonyms: Math.max(0, ...llm.map((e) => e.pseudonyms ?? 0)),
    sources,
    analysisBytes: analysis?.bytes ?? 0,
  };
}
