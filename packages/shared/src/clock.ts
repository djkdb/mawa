/**
 * The demo workspace's "now": Saturday 3 Oct 2026, 12:00 KST. The sample data is written for that week
 * (mail text says "10월 5일 23:59"), so demo runs read the fixtures, compute periods and D-days from
 * this instant instead of the wall clock. Real mode always uses the wall clock.
 */
export const DEMO_NOW = '2026-10-03T03:00:00.000Z';

/** Wall-clock ms, unless MAWA_NOW is set (the MCP client sets it for servers it starts in demo mode). */
export function clockNow(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const pinned = env?.['MAWA_NOW'];
  const t = pinned ? Date.parse(pinned) : NaN;
  return Number.isNaN(t) ? Date.now() : t;
}
