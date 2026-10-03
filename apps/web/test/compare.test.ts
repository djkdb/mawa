import { describe, expect, it } from 'vitest';
import type { WeeklyWorkReport } from '@mawa/shared';
import { diffReports } from '../src/lib/compare.js';

const rep = (risks: Array<[string, string]>, sources: string[]): WeeklyWorkReport => ({
  runId: 'r', mode: 'real', generatedAt: '2026-10-03T00:00:00.000Z', period: { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' }, title: 't',
  sources: sources.map((id) => ({ id, type: 'github', title: id, metadata: { kind: id.split(':')[1] } })),
  sections: [{ id: 'potential_risks', title: 'r', items: risks.map(([id, src]) => ({ id, text: id, confidence: 'inferred', sources: [src] })) }],
});

describe('diffReports', () => {
  it('classifies risks as new, continuing or resolved by their primary source', () => {
    const prev = rep([['old17', 'github:issue:a#17'], ['old9', 'github:issue:a#9']], ['github:issue:a#17', 'github:issue:a#9']);
    const cur = rep([['now17', 'github:issue:a#17'], ['now20', 'github:issue:a#20']], ['github:issue:a#17', 'github:issue:a#20', 'github:pr:a#3']);
    const d = diffReports(cur, prev);
    expect(d.added.map((i) => i.id)).toEqual(['now20']);
    expect(d.continuing.map((i) => i.id)).toEqual(['now17']);
    expect(d.resolved.map((i) => i.id)).toEqual(['old9']);
    expect(d.counts).toEqual([{ kind: 'pr', now: 1, prev: 0 }, { kind: 'issue', now: 2, prev: 2 }]);
    expect(d.identical).toBe(false);
  });
  it('reports identical runs as such', () => {
    const r = rep([['x', 'github:issue:a#1']], ['github:issue:a#1']);
    expect(diffReports(r, r).identical).toBe(true);
  });
});
