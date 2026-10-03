#!/usr/bin/env node
/**
 * Scores the recorded demo runs against the hand-written gold items (packages/shared/demo/eval-gold.json):
 * how many the report found, and how many more the omission check caught. Writes eval-results.json
 * (shown in the web demo) and prints a table.   npm run eval
 * The export and record scripts rewrite eval-results.json too, so it never lags the recordings.
 */
import { writeEvalResults } from './lib/eval.mjs';

for (const s of await writeEvalResults()) {
  const miss = s.items.filter((i) => i.foundBy !== 'report').map((i) => `${i.label}${i.foundBy === 'check' ? ' (검사가 잡음)' : ''}`);
  console.log(`${s.title.padEnd(18)} ${s.runId.padEnd(18)} ${s.writer.padEnd(28)} report ${s.inReport}/${s.total}  +check ${s.withCheck}/${s.total}${miss.length ? `  · 놓침: ${miss.join(', ')}` : ''}`);
}
