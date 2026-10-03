#!/usr/bin/env node
/**
 *   node mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=gateway-audit.jsonl
 * Then point any MCP client at it, e.g. Claude Code:
 *   claude mcp add mawa-gateway -- node <repo>/mcp-servers/gateway/dist/index.js --mode=demo --policy=<repo>/mcp-servers/gateway/policy.example.json --audit=<repo>/gateway-audit.jsonl
 * Real mode starts the servers whose credentials are in the environment (GITHUB_TOKEN, GOOGLE_ACCESS_TOKEN, LMS_TOKEN + LMS_BASE_URL).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpToolExecutor } from '@mawa/agent-core';
import { createGateway } from './gateway.js';
import { createRemoteGateway, loadUsers, newUserToken } from './remote.js';

export { createGateway, SERVER_NAME, SERVER_VERSION, type AuditEntry, type GatewayOptions } from './gateway.js';
export { createRemoteGateway, loadUsers, newUserToken, sha256, type GatewayUser } from './remote.js';

const ENV: Record<string, string[]> = { github: ['GITHUB_TOKEN'], gmail: ['GOOGLE_ACCESS_TOKEN'], calendar: ['GOOGLE_ACCESS_TOKEN'], lms: ['LMS_TOKEN', 'LMS_BASE_URL'] };

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  // `--new-token=<user>`: print a token once and the users-file entry holding only its hash.
  if (arg('new-token')) {
    const { token, entry } = newUserToken(arg('new-token')!);
    console.log(`token (shown once): ${token}\nadd to the users file: ${JSON.stringify(entry)}`);
    return;
  }
  const mode = arg('mode') === 'real' ? 'real' : 'demo';
  const policy = arg('policy') ? JSON.parse(await readFile(arg('policy')!, 'utf8')) : {};
  const persona = arg('persona');
  const ids = (arg('servers') ?? (persona === 'worker' ? 'github,gmail,calendar' : 'github,gmail,calendar,lms')).split(',').filter((id) => ENV[id] && (mode === 'demo' || ENV[id]!.some((k) => process.env[k])));
  const servers = ids.map((id) => ({
    id: id as 'github' | 'gmail' | 'calendar' | 'lms',
    command: process.execPath,
    args: [fileURLToPath(new URL(`../../${id}/dist/index.js`, import.meta.url))],
    env: Object.fromEntries(ENV[id]!.filter((k) => process.env[k]).map((k) => [k, process.env[k]!])),
  }));
  const executor = new McpToolExecutor({ servers, mode, clientName: 'mawa-gateway', ...(persona && mode === 'demo' ? { persona } : {}) });
  const auditPath = arg('audit');
  const close = () => { void executor.close().finally(() => process.exit(0)); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  // Remote mode: Streamable HTTP with per-user Bearer tokens (--users=<file>), loopback unless --host.
  if (arg('http')) {
    if (!arg('users')) throw new Error('--http needs --users=<file> (create entries with --new-token=<user>)');
    const { http } = createRemoteGateway({ executor, policy, mode, users: await loadUsers(arg('users')!), ...(auditPath ? { auditPath } : {}) });
    const host = arg('host') ?? '127.0.0.1';
    http.listen(Number(arg('http')), host, () => console.error(`[mawa-gateway] http://${host}:${arg('http')}/mcp (mode=${mode}, servers=${ids.join(',')}, audit=${auditPath ?? 'memory'})`));
    return;
  }
  const { server } = createGateway({ executor, policy, mode, ...(auditPath ? { auditPath } : {}) });
  await server.connect(new StdioServerTransport());
  process.stdin.on('end', close);
  console.error(`[mawa-gateway] ready (mode=${mode}, servers=${ids.join(',')}, audit=${auditPath ?? 'memory'})`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main().catch((err) => {
    console.error('[mawa-gateway] fatal:', err);
    process.exit(1);
  });
}
