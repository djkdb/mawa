import { z } from 'zod';

/**
 * Argument-level limits: not only which tool, but how much of the data it may touch.
 * - maxDays: how far back (or ahead) a read may reach; `days` is clamped, `since`/`timeMin`/`timeMax` too
 * - maxResults: `limit` is clamped (and set when missing)
 * - repos: GitHub reads are confined to these repositories
 * - senderDomains: mail rows from other domains are dropped
 * A whole-mailbox query (`*`, empty) is refused.
 */
export const ArgLimitsSchema = z.object({
  maxDays: z.number().int().min(1).max(365).optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  repos: z.array(z.string().max(100)).max(50).optional(),
  senderDomains: z.array(z.string().max(100)).max(50).optional(),
});
export type ArgLimits = z.infer<typeof ArgLimitsSchema>;

const DAY = 86_400_000;
const SINCE_TOOLS = new Set(['gmail__search_emails', 'gmail__search_project_emails', 'github__get_recent_commits', 'github__get_pull_requests', 'github__get_repository_activity']);

export interface ArgDecision { input: Record<string, unknown>; changes: string[]; refused?: string }

/** Applies the limits to one tool call's arguments: clamps what can be clamped, refuses what cannot. */
export function applyArgLimits(tool: string, input: Record<string, unknown>, limits: ArgLimits | undefined, now: number): ArgDecision {
  if (!limits) return { input, changes: [] };
  const out = { ...input };
  const changes: string[] = [];
  if (tool === 'gmail__search_emails') {
    const q = String(out['query'] ?? '').trim();
    if (!q || /^[*\s]+$/.test(q)) return { input, changes, refused: '사서함 전체를 뒤지는 검색은 허용하지 않습니다' };
  }
  if (limits.repos && typeof out['repo'] === 'string' && !limits.repos.includes(out['repo'] as string)) {
    return { input, changes, refused: `허용되지 않은 저장소입니다: ${String(out['repo'])}` };
  }
  if (limits.maxDays) {
    const max = limits.maxDays;
    if (typeof out['days'] === 'number' && (out['days'] as number) > max) { changes.push(`days ${String(out['days'])}→${max}`); out['days'] = max; }
    const floor = new Date(now - max * DAY).toISOString();
    const ceil = new Date(now + max * DAY).toISOString();
    for (const k of ['since', 'timeMin'] as const) {
      if (typeof out[k] === 'string' && (out[k] as string) < floor) { changes.push(`${k} → ${floor.slice(0, 10)}`); out[k] = floor; }
    }
    if (typeof out['timeMax'] === 'string' && (out['timeMax'] as string) > ceil) { changes.push(`timeMax → ${ceil.slice(0, 10)}`); out['timeMax'] = ceil; }
    if (SINCE_TOOLS.has(tool) && out['since'] === undefined) { changes.push(`since → ${floor.slice(0, 10)}`); out['since'] = floor; }
  }
  if (limits.maxResults && tool !== 'gmail__get_email' && tool !== 'lms__get_courses') {
    const lim = out['limit'];
    if (typeof lim !== 'number' || lim > limits.maxResults) { changes.push(`limit ${typeof lim === 'number' ? lim : '기본'}→${limits.maxResults}`); out['limit'] = limits.maxResults; }
  }
  return { input: out, changes };
}

/** Drops result rows outside the allowed repositories or sender domains; returns what was dropped and why. */
export function filterRowsByLimits(rows: unknown[], limits: ArgLimits | undefined): { kept: unknown[]; dropped: Array<{ sourceId: string; rule: string }> } {
  if (!limits?.repos && !limits?.senderDomains) return { kept: rows, dropped: [] };
  const kept: unknown[] = [];
  const dropped: Array<{ sourceId: string; rule: string }> = [];
  for (const row of rows) {
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    const id = typeof r?.['sourceId'] === 'string' ? (r['sourceId'] as string) : '';
    if (r && limits.repos && typeof r['repo'] === 'string' && !limits.repos.includes(r['repo'] as string)) { dropped.push({ sourceId: id, rule: '허용 외 저장소' }); continue; }
    if (r && limits.senderDomains && typeof r['from'] === 'string') {
      const domain = /@([^>\s]+)/.exec(r['from'] as string)?.[1]?.toLowerCase();
      if (domain && !limits.senderDomains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) { dropped.push({ sourceId: id, rule: '허용 외 발신 도메인' }); continue; }
    }
    kept.push(row);
  }
  return { kept, dropped };
}

/** The stricter of two limit sets. */
export function mergeLimits(a: ArgLimits | undefined, b: ArgLimits | undefined): ArgLimits | undefined {
  if (!a) return b;
  if (!b) return a;
  const min = (x?: number, y?: number) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));
  const both = (x?: string[], y?: string[]) => (x && y ? x.filter((v) => y.includes(v)) : x ?? y);
  const out: ArgLimits = {};
  const md = min(a.maxDays, b.maxDays); if (md !== undefined) out.maxDays = md;
  const mr = min(a.maxResults, b.maxResults); if (mr !== undefined) out.maxResults = mr;
  const rp = both(a.repos, b.repos); if (rp) out.repos = rp;
  const sd = both(a.senderDomains, b.senderDomains); if (sd) out.senderDomains = sd;
  return out;
}
