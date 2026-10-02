import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration test: spawns the built server as a child process and talks to
 * it with the official MCP client over stdio. Requires `npm run build` first
 * (root `pretest` does this).
 */
describe('GitHub MCP server (demo mode, stdio)', () => {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mode=demo'], stderr: 'pipe' }));
  }, 20_000);
  afterAll(() => client.close());

  it('lists the four GitHub tools with JSON schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_open_issues', 'get_pull_requests', 'get_recent_commits', 'get_repository_activity']);
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
    expect(tools[0]?.description).toContain('[DEMO DATA]');
  });

  it('get_recent_commits returns 12 fixture commits with this-week dates', async () => {
    const res = await client.callTool({ name: 'get_recent_commits', arguments: { limit: 50 } });
    const sc = res.structuredContent as { summary: string; data: Array<{ sourceId: string; date: string; repo: string }> };
    expect(sc.data).toHaveLength(12);
    expect(sc.summary).toMatch(/12 commits/);
    expect(sc.data.every((c) => c.sourceId.startsWith('github:commit:'))).toBe(true);
    const ageMs = Date.now() - new Date(sc.data[0]!.date).getTime();
    expect(ageMs).toBeLessThan(7 * 86_400_000);
  });

  it('get_pull_requests filters by state', async () => {
    const res = await client.callTool({ name: 'get_pull_requests', arguments: { state: 'merged' } });
    const sc = res.structuredContent as { data: Array<{ state: string }> };
    expect(sc.data).toHaveLength(2);
    expect(sc.data.every((p) => p.state === 'merged')).toBe(true);
  });

  it('get_open_issues returns 4 and get_repository_activity returns 2', async () => {
    const issues = await client.callTool({ name: 'get_open_issues', arguments: {} });
    expect((issues.structuredContent as { data: unknown[] }).data).toHaveLength(4);
    const repos = await client.callTool({ name: 'get_repository_activity', arguments: {} });
    expect((repos.structuredContent as { data: unknown[] }).data).toHaveLength(2);
  });

  it('rejects invalid input via schema', async () => {
    const res = await client.callTool({ name: 'get_recent_commits', arguments: { limit: 0 } });
    expect(res.isError).toBe(true);
  });
});
