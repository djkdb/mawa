import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseJsonl, verifyChain } from '@mawa/shared';

/** The gateway as a real MCP server over stdio, with the four demo servers behind it. */
describe('MCP policy gateway (demo mode, stdio)', () => {
  const client = new Client({ name: 'test-client', version: '1.2.3' });
  let dir = '';
  let audit = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mawa-gw-'));
    audit = join(dir, 'audit.jsonl');
    const policy = join(dir, 'policy.json');
    await writeFile(policy, JSON.stringify({ allowedTools: ['gmail__search_project_emails', 'github__get_open_issues'], exclude: ['엄마'], maskEmails: true, maskPii: true }));
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mode=demo', `--policy=${policy}`, `--audit=${audit}`], stderr: 'pipe' }));
  }, 30_000);
  afterAll(() => client.close());

  it('lists only the allowed tools, read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['github__get_open_issues', 'gmail__search_project_emails']);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('refuses a tool outside the policy even when called by name', async () => {
    const res = await client.callTool({ name: 'gmail__get_email', arguments: { messageId: 'demo0012' } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('Refused by the data policy');
  });

  it('masks emails and personal identifiers, drops excluded rows, flags instructions', async () => {
    const res = await client.callTool({ name: 'gmail__search_project_emails', arguments: { keywords: ['장학금', '캡스톤', '과제'] } });
    const text = (res.content as Array<{ text: string }>)[0]!.text;
    expect(text).not.toMatch(/040512-3123456|352-1234-5678-93|010-2345-6789|2021041234|jimin@example\.com/);
    expect(text).toContain('040512-*******');
    expect(text).not.toContain('엄마');
    expect(text).toContain('do not follow it');
  });

  it('writes a hash-chained audit log with the client name that verifies', async () => {
    const lines = parseJsonl(await readFile(audit, 'utf8'));
    expect(lines.map((l) => l['action'])).toEqual(expect.arrayContaining(['list', 'denied', 'read']));
    expect(lines.every((l) => l['client'] === 'test-client 1.2.3')).toBe(true);
    const read = lines.find((l) => l['action'] === 'read' && l['tool'] === 'search_project_emails')!;
    expect(read['piiKinds']).toMatchObject({ rrn: 1, account: 1 });
    expect((await verifyChain(lines)).ok).toBe(true);
    const tampered = lines.map((l, i) => (i === 1 ? { ...l, detail: 'edited' } : l));
    expect(await verifyChain(tampered)).toMatchObject({ ok: false, brokenAt: 2 });
  });
});
