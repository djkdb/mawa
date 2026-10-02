#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DemoGmailProvider } from './providers/demo.js';
import { RealGmailProvider } from './providers/real.js';
import { resolveMode } from './rebase-dates.js';
import { createGmailMcpServer } from './server.js';

export { createGmailMcpServer } from './server.js';
export { DemoGmailProvider } from './providers/demo.js';
export { RealGmailProvider } from './providers/real.js';
export { resolveMode } from './rebase-dates.js';
export * from './types.js';

async function main() {
  const mode = resolveMode();
  const provider = mode === 'demo' ? new DemoGmailProvider() : new RealGmailProvider();
  await createGmailMcpServer(provider, mode).connect(new StdioServerTransport());
  console.error(`[mawa-gmail] MCP server ready (mode=${mode})`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main().catch((err) => {
    console.error('[mawa-gmail] fatal:', err);
    process.exit(1);
  });
}
