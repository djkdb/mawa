import type { WeeklyWorkReport } from '@mawa/shared';

/** Something dated in the next two weeks that a report about the week should probably mention. */
export interface CoverageCandidate { sourceId: string; title: string; at: string; why: string }

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const DUE_WORD = /까지|마감|만료|회신|제출|신청|등록|due|deadline/i;
const DATE_KO = /(\d{1,2})월\s?(\d{1,2})일/g;

/** "10월 6일" in the year of `now`, end of that day KST. */
function dayOf(month: number, day: number, now: number): number {
  const y = new Date(now + KST).getUTCFullYear();
  return Date.UTC(y, month - 1, day, 23, 59) - KST;
}

/**
 * Deterministic candidates from tool rows: eCampus deadlines and calendar events in the window, and
 * mails that state a date next to a deadline word ("10월 6일까지 회신"). No model involved.
 */
export function coverageCandidates(rows: unknown[], now: number, horizonDays = 14): CoverageCandidate[] {
  const until = now + horizonDays * DAY;
  const out = new Map<string, CoverageCandidate>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r['sourceId'] === 'string' ? (r['sourceId'] as string) : null;
    if (!id || out.has(id)) continue;
    const title = String(r['title'] ?? r['subject'] ?? '').trim();
    const kind = id.split(':')[1];
    const at = typeof r['due'] === 'string' ? (r['due'] as string) : typeof r['start'] === 'string' ? (r['start'] as string) : null;
    if ((kind === 'due' || kind === 'event') && at) {
      const t = Date.parse(at);
      if (t >= now && t <= until) out.set(id, { sourceId: id, title, at, why: kind === 'due' ? 'eCampus 마감' : '캘린더 일정' });
      continue;
    }
    if (kind === 'msg') {
      const text = `${title} ${String(r['snippet'] ?? '')}`;
      if (!DUE_WORD.test(text)) continue;
      for (const m of text.matchAll(DATE_KO)) {
        const t = dayOf(Number(m[1]), Number(m[2]), now);
        if (t >= now && t <= until) { out.set(id, { sourceId: id, title, at: new Date(t).toISOString(), why: `메일에 적힌 날짜 (${m[0]})` }); break; }
      }
    }
  }
  return [...out.values()].sort((a, b) => a.at.localeCompare(b.at));
}

const words = (s: string) => s.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[\s,·:/]+/).map((w) => w.replace(/[^\p{L}\p{N}#]/gu, '')).filter((w) => w.length >= 2 && !/^(안내|확인|요청|부탁|드립니다|필수|긴급|공지|알림|관련)$/.test(w));

/** Candidates the report neither cites nor names (two of the title's words, or the only one). */
export function uncoveredCandidates(cands: CoverageCandidate[], report: WeeklyWorkReport): CoverageCandidate[] {
  const items = report.sections.flatMap((s) => s.items);
  const cited = new Set(items.flatMap((i) => i.sources));
  const text = items.map((i) => i.text).join('\n');
  return cands.filter((c) => {
    if (cited.has(c.sourceId)) return false;
    const w = words(c.title);
    const hits = w.filter((x) => text.includes(x)).length;
    return !(w.length > 0 && hits >= Math.min(2, w.length));
  });
}
