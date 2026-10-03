import { readFile, writeFile } from 'node:fs/promises';
import { scoreRun } from '@mawa/shared';

const root = new URL('../../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));

/** Scores every gold case against the recorded runs and writes eval-results.json; returns the results. */
export async function writeEvalResults() {
  const gold = await read('packages/shared/demo/eval-gold.json');
  const { runs } = await read('packages/shared/demo/demo-runs.json');
  const results = [];
  for (const c of gold.cases) {
    for (const id of c.runs) {
      const r = runs.find((x) => x.id === id);
      if (!r) continue;
      results.push({ ...scoreRun(c, id, r.report, r.events), title: c.title, writer: r.llm.provider === 'scripted' ? 'scripted' : `${r.llm.provider}/${r.llm.model}` });
    }
  }
  await writeFile(new URL('packages/shared/demo/eval-results.json', root), JSON.stringify({ note: 'npm run eval over the recorded demo runs. Synthetic data; gold items in eval-gold.json.', results }, null, 2));
  return results;
}
