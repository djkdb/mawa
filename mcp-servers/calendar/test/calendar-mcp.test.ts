import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Calendar MCP server (demo mode, stdio)', () => {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mode=demo'], stderr: 'pipe' }));
  }, 20_000);
  afterAll(() => client.close());

  it('lists three tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_events', 'get_upcoming_events', 'search_events']);
  });

  it('get_upcoming_events returns the 5 future demo events within 7 days, sorted', async () => {
    const res = await client.callTool({ name: 'get_upcoming_events', arguments: { days: 7 } });
    const sc = res.structuredContent as { data: Array<{ start: string; sourceId: string }> };
    expect(sc.data).toHaveLength(5);
    expect(sc.data.every((e) => e.sourceId.startsWith('calendar:event:'))).toBe(true);
    const starts = sc.data.map((e) => e.start);
    expect([...starts].sort()).toEqual(starts);
  });

  it('search_events matches by text across ±30 days', async () => {
    const res = await client.callTool({ name: 'search_events', arguments: { query: '중간발표' } });
    const sc = res.structuredContent as { data: Array<{ title: string }> };
    // Matches the presentation itself and the team meeting whose description mentions it.
    expect(sc.data).toHaveLength(2);
    expect(sc.data.some((e) => e.title === '캡스톤디자인 중간발표')).toBe(true);
  });

  it('get_events over a 30-day window returns all 8 fixture events', async () => {
    const now = Date.now();
    const res = await client.callTool({ name: 'get_events', arguments: { timeMin: new Date(now - 15 * 86_400_000).toISOString(), timeMax: new Date(now + 15 * 86_400_000).toISOString() } });
    expect((res.structuredContent as { data: unknown[] }).data).toHaveLength(8);
  });
});
