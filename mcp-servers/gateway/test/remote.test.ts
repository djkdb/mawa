import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { McpToolExecutor } from '@mawa/agent-core';
import { parseJsonl, verifyChain } from '@mawa/shared';
import { createRemoteGateway, newUserToken } from '../src/remote.js';

/** The gateway over Streamable HTTP: tokens map to users, sessions are per user, the audit names the user. */
describe('remote gateway (Streamable HTTP, per-user tokens)', () => {
  const server = (id: 'github' | 'gmail') => ({ id, command: process.execPath, args: [fileURLToPath(new URL(`../../${id}/dist/index.js`, import.meta.url))] });
  const executor = new McpToolExecutor({ servers: [server('github'), server('gmail')], mode: 'demo' });
  const alice = newUserToken('seongjun');
  const bob = newUserToken('jimin');
  bob.entry.policy = { allowedTools: ['github__get_open_issues'] };
  let url: URL;
  let audit = '';
  let close: () => Promise<void>;
  const connect = async (token?: string) => {
    const client = new Client({ name: 'remote-test', version: '0.0.1' });
    await client.connect(new StreamableHTTPClientTransport(url, token ? { requestInit: { headers: { authorization: `Bearer ${token}` } } } : {}));
    return client;
  };

  beforeAll(async () => {
    audit = join(await mkdtemp(join(tmpdir(), 'mawa-gw-http-')), 'audit.jsonl');
    const { http } = createRemoteGateway({ executor, mode: 'demo', policy: { allowedTools: ['github__get_open_issues', 'gmail__search_project_emails'], maskPii: true }, users: [alice.entry, bob.entry], auditPath: audit });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
    url = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`);
    close = () => new Promise((r) => http.close(() => r()));
  }, 30_000);
  afterAll(async () => { await close(); await executor.close(); });

  it('rejects requests without a valid token', async () => {
    await expect(connect()).rejects.toThrow();
    await expect(connect('mgw_not-a-real-token')).rejects.toThrow();
  });

  it('gives each user the gateway policy, tightened by their own', async () => {
    const a = await connect(alice.token);
    expect((await a.listTools()).tools.map((t) => t.name).sort()).toEqual(['github__get_open_issues', 'gmail__search_project_emails']);
    const b = await connect(bob.token);
    expect((await b.listTools()).tools.map((t) => t.name)).toEqual(['github__get_open_issues']);
    const refused = await b.callTool({ name: 'gmail__search_project_emails', arguments: { keywords: ['장학금'] } });
    expect(refused.isError).toBe(true);
    const ok = await a.callTool({ name: 'gmail__search_project_emails', arguments: { keywords: ['장학금'] } });
    expect(JSON.stringify(ok.content)).toContain('040512-*******');
    await a.close(); await b.close();
  }, 30_000);

  it('records the user on every line of one verifiable chain', async () => {
    const lines = parseJsonl(await readFile(audit, 'utf8'));
    expect(lines.filter((l) => l['action'] === 'denied' && !l['user']).length).toBe(2);
    expect(lines.some((l) => l['user'] === 'jimin' && l['action'] === 'denied' && l['tool'] === 'search_project_emails')).toBe(true);
    expect(lines.some((l) => l['user'] === 'seongjun' && l['action'] === 'read')).toBe(true);
    expect((await verifyChain(lines)).ok).toBe(true);
  });
});
