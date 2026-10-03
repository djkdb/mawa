import type { ReportItem, WeeklyWorkReport } from '@mawa/shared';

export interface ReportDiff {
  /** Per source kind: count now vs. in the previous run. */
  counts: Array<{ kind: string; now: number; prev: number }>;
  added: ReportItem[];
  continuing: ReportItem[];
  resolved: ReportItem[];
  identical: boolean;
}

const KINDS = ['commit', 'pr', 'issue', 'event', 'msg'];
const risks = (r: WeeklyWorkReport) => r.sections.find((s) => s.id === 'potential_risks')?.items ?? [];
/** A risk is "the same" across runs when it is about the same primary source (issue, PR, mail …). */
const keyOf = (i: ReportItem) => i.sources[0] ?? i.text;

/** What changed between two reports of the same question. Purely id-based: no text similarity guesses. */
export function diffReports(cur: WeeklyWorkReport, prev: WeeklyWorkReport): ReportDiff {
  const count = (r: WeeklyWorkReport, k: string) => r.sources.filter((s) => s.metadata['kind'] === k).length;
  const counts = KINDS.map((kind) => ({ kind, now: count(cur, kind), prev: count(prev, kind) })).filter((c) => c.now || c.prev);
  const prevKeys = new Set(risks(prev).map(keyOf));
  const curKeys = new Set(risks(cur).map(keyOf));
  const added = risks(cur).filter((i) => !prevKeys.has(keyOf(i)));
  const continuing = risks(cur).filter((i) => prevKeys.has(keyOf(i)));
  const resolved = risks(prev).filter((i) => !curKeys.has(keyOf(i)));
  const sameSources = cur.sources.length === prev.sources.length && cur.sources.every((s, i) => s.id === prev.sources[i]?.id);
  return { counts, added, continuing, resolved, identical: sameSources && !added.length && !resolved.length };
}
