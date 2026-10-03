import { describe, expect, it } from 'vitest';
import { applyArgLimits, filterRowsByLimits, mergeLimits, tightenPolicy, DataPolicySchema } from '../src/index.js';

const now = Date.parse('2026-10-03T03:00:00.000Z');

describe('argument limits', () => {
  it('clamps the period and result count, refuses whole-mailbox queries and other repositories', () => {
    const l = { maxDays: 7, maxResults: 20, repos: ['b-company/payments-api'] };
    expect(applyArgLimits('calendar__get_upcoming_events', { days: 14 }, l, now)).toMatchObject({ input: { days: 7, limit: 20 }, changes: ['days 14→7', 'limit 기본→20'] });
    const s = applyArgLimits('gmail__search_project_emails', { keywords: ['x'], since: '2026-01-01T00:00:00.000Z', limit: 100 }, l, now);
    expect(s.input['since']).toBe('2026-09-26T03:00:00.000Z');
    expect(s.input['limit']).toBe(20);
    expect(applyArgLimits('gmail__search_emails', { query: '*' }, l, now).refused).toMatch(/사서함 전체/);
    expect(applyArgLimits('github__get_open_issues', { repo: 'other/repo' }, l, now).refused).toMatch(/허용되지 않은 저장소/);
    expect(applyArgLimits('github__get_open_issues', {}, undefined, now)).toEqual({ input: {}, changes: [] });
  });

  it('drops rows from other repositories and sender domains', () => {
    const rows = [{ sourceId: 'a', repo: 'b-company/payments-api' }, { sourceId: 'b', repo: 'x/y' }, { sourceId: 'c', from: '고객 <c@c-shop.example.com>' }, { sourceId: 'd', from: '팀장 <s@b-company.example.com>' }];
    const r = filterRowsByLimits(rows, { repos: ['b-company/payments-api'], senderDomains: ['b-company.example.com'] });
    expect(r.kept.map((x) => (x as { sourceId: string }).sourceId)).toEqual(['a', 'd']);
    expect(r.dropped).toEqual([{ sourceId: 'b', rule: '허용 외 저장소' }, { sourceId: 'c', rule: '허용 외 발신 도메인' }]);
  });

  it('merges to the stricter limits; a request cannot widen the server limits', () => {
    expect(mergeLimits({ maxDays: 14, repos: ['a', 'b'] }, { maxDays: 7, repos: ['b', 'c'] })).toEqual({ maxDays: 7, repos: ['b'] });
    const base = DataPolicySchema.parse({ limits: { maxDays: 14 } });
    expect(tightenPolicy(base, { limits: { maxDays: 30 } }).refused).toEqual(['limits']);
    expect(tightenPolicy(base, { limits: { maxDays: 7 } }).policy.limits).toEqual({ maxDays: 7 });
  });
});

describe('eval scoring', () => {
  it('counts gold items found by the report, then by the omission check, never a conflict by the check', async () => {
    const { scoreRun } = await import('../src/index.js');
    const gold = { id: 'g', persona: 'worker', title: 't', runs: [], items: [
      { id: 'deploy', label: '배포', all: ['정기 배포'] },
      { id: 'reply', label: '회신', all: ['회신|불일치'] },
      { id: 'conflict', label: '불일치', all: ['세미나', '8일'], check: false },
    ] };
    const report = { runId: 'r', mode: 'demo', prompt: 'p', generatedAt: '2026-10-03T03:00:00.000Z', period: { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' }, sections: [{ id: 'schedule', title: 's', items: [{ id: 'i', text: '10/6 정기 배포', confidence: 'observed', sources: [] }] }], sources: [] };
    const events = [{ type: 'coverage_checked', runId: 'r', mode: 'demo', timestamp: '2026-10-03T03:00:00.000Z', reads: [], checked: 3, missed: [{ sourceId: 'm', title: '정산 금액 불일치 문의', at: '2026-10-06T14:59:00.000Z', why: 'x' }, { sourceId: 'e', title: '사내 세미나', at: '2026-10-08T08:00:00.000Z', why: 'y' }] }];
    const s = scoreRun(gold, 'r', report as never, events as never);
    expect(s).toMatchObject({ total: 3, inReport: 1, withCheck: 2 });
    expect(s.items.map((i) => i.foundBy)).toEqual(['report', 'check', null]);
  });
});
