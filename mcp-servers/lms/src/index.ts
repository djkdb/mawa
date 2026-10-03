#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DemoLmsProvider } from './providers/demo.js';
import { MoodleLmsProvider } from './providers/moodle.js';
import { resolveMode } from './rebase-dates.js';
import { createLmsMcpServer } from './server.js';

export { createLmsMcpServer } from './server.js';
export { DemoLmsProvider } from './providers/demo.js';
export { MoodleLmsProvider, moodleToken } from './providers/moodle.js';
export { resolveMode } from './rebase-dates.js';
export * from './types.js';

async function main() {
  const mode = resolveMode();
  const provider = mode === 'demo' ? new DemoLmsProvider() : new MoodleLmsProvider();
  await createLmsMcpServer(provider, mode).connect(new StdioServerTransport());
  console.error(`[mawa-lms] MCP server ready (mode=${mode})`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main().catch((err) => {
    console.error('[mawa-lms] fatal:', err);
    process.exit(1);
  });
}
