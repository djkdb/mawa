#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DemoCalendarProvider } from './providers/demo.js';
import { RealCalendarProvider } from './providers/real.js';
import { resolveMode } from './rebase-dates.js';
import { createCalendarMcpServer } from './server.js';

export { createCalendarMcpServer } from './server.js';
export { DemoCalendarProvider } from './providers/demo.js';
export { RealCalendarProvider } from './providers/real.js';
export { resolveMode } from './rebase-dates.js';
export * from './types.js';

async function main() {
  const mode = resolveMode();
  const provider = mode === 'demo' ? new DemoCalendarProvider() : new RealCalendarProvider();
  await createCalendarMcpServer(provider, mode).connect(new StdioServerTransport());
  console.error(`[mawa-calendar] MCP server ready (mode=${mode})`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main().catch((err) => {
    console.error('[mawa-calendar] fatal:', err);
    process.exit(1);
  });
}
