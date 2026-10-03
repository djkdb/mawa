import { writeFile } from 'node:fs/promises';
import { ChainedAuditLog } from '@mawa/agent-core';
import { auditRows } from '@mawa/shared';

/**
 * Writes the demo's audit log once, at recording time: every shipped run's audit rows, hash-chained
 * in run order. The web demo verifies these stored hashes; it does not rebuild them for display.
 */
export async function writeDemoAudit(runs, file) {
  const log = new ChainedAuditLog();
  for (const r of runs) await log.append(auditRows(r.events));
  const { entries, check } = await log.read();
  if (!check.ok) throw new Error('demo audit chain does not verify');
  await writeFile(file, JSON.stringify({ note: 'Hash-chained audit of the shipped demo runs, written by scripts/export-portfolio-data.mjs / record-llm-run.mjs. Synthetic data.', head: check.head, entries }, null, 2));
  return entries.length;
}
