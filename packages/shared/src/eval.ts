import type { AgentEvent } from './events/index.js';
import type { WeeklyWorkReport } from './report/index.js';

export interface GoldItem { id: string; label: string; all: string[]; /** false: the omission check cannot catch this kind (a conflict, a status), only the report can. */ check?: boolean }
export interface GoldCase { id: string; persona: string; title: string; runs: string[]; items: GoldItem[] }
export interface ItemScore { id: string; label: string; foundBy: 'report' | 'check' | null; evidence?: string }
export interface RunScore { caseId: string; runId: string; total: number; inReport: number; withCheck: number; items: ItemScore[] }

const matches = (text: string, all: string[]) => all.every((p) => new RegExp(p, 'i').test(text));

/**
 * Scores one recorded run against a gold case: an item is found by the report when one sentence matches
 * every pattern, else by the omission check when one of its "possibly missed" titles does.
 */
export function scoreRun(gold: GoldCase, runId: string, report: WeeklyWorkReport, events: AgentEvent[]): RunScore {
  const sentences = report.sections.flatMap((s) => s.items.map((i) => i.text));
  const cov = events.find((e): e is Extract<AgentEvent, { type: 'coverage_checked' }> => e.type === 'coverage_checked');
  const missed = cov?.missed.map((m) => `${m.title} ${new Date(m.at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })}`) ?? [];
  const items = gold.items.map((it): ItemScore => {
    const s = sentences.find((t) => matches(t, it.all));
    if (s) return { id: it.id, label: it.label, foundBy: 'report', evidence: s };
    const m = it.check === false ? undefined : missed.find((t) => matches(t, it.all));
    return m ? { id: it.id, label: it.label, foundBy: 'check', evidence: m } : { id: it.id, label: it.label, foundBy: null };
  });
  const inReport = items.filter((i) => i.foundBy === 'report').length;
  return { caseId: gold.id, runId, total: items.length, inReport, withCheck: inReport + items.filter((i) => i.foundBy === 'check').length, items };
}
