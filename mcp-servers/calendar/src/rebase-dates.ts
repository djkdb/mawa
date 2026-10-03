import { clockNow } from '@mawa/shared';
/**
 * Replace `{"$daysAgo": n}` markers (negative = future) with ISO timestamps relative to now.
 * `{"$daysAgo": n, "$time": "15:00"}` pins the wall-clock time in Asia/Seoul, so events land on sensible hours.
 */
export function rebaseDates(value: unknown, now = clockNow()): unknown {
  if (Array.isArray(value)) return value.map((v) => rebaseDates(v, now));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (typeof obj['$daysAgo'] === 'number' && (keys.length === 1 || (keys.length === 2 && typeof obj['$time'] === 'string'))) {
      const at = new Date(now - obj['$daysAgo'] * 86_400_000);
      if (typeof obj['$time'] !== 'string') return at.toISOString();
      const [hh, mm] = (obj['$time'] as string).split(':').map(Number);
      const kst = new Date(at.getTime() + 9 * 3_600_000); // Seoul calendar date of that instant
      return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), (hh ?? 0) - 9, mm ?? 0)).toISOString();
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, rebaseDates(v, now)]));
  }
  return value;
}

/** Resolve mode from `--mode=demo|real` or MCP_MODE env. Defaults to demo so a bare start never needs secrets. */
export function resolveMode(argv = process.argv, env = process.env): 'demo' | 'real' {
  const flag = argv.find((a) => a.startsWith('--mode='))?.split('=')[1];
  const mode = flag ?? env['MCP_MODE'] ?? 'demo';
  if (mode !== 'demo' && mode !== 'real') throw new Error(`Unknown mode "${mode}"`);
  return mode;
}

export function reply<T>(summary: string, data: T) {
  return { content: [{ type: 'text' as const, text: `${summary}\n${JSON.stringify(data, null, 2)}` }], structuredContent: { summary, data } };
}
