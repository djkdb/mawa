/** Replace `{"$daysAgo": n}` markers (negative = future) with ISO timestamps relative to now. */
export function rebaseDates(value: unknown, now = Date.now()): unknown {
  if (Array.isArray(value)) return value.map((v) => rebaseDates(v, now));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['$daysAgo'] === 'number' && Object.keys(obj).length === 1) {
      return new Date(now - obj['$daysAgo'] * 86_400_000).toISOString();
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
