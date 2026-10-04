#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DemoGitHubProvider } from './providers/demo.js';
import { RealGitHubProvider } from './providers/real.js';
import { createGitHubMcpServer } from './server.js';

export { createGitHubMcpServer } from './server.js';
export { DemoGitHubProvider } from './providers/demo.js';
export { RealGitHubProvider } from './providers/real.js';
export * from './types.js';

/** Resolve mode from `--mode=demo|real` or MCP_MODE env. Defaults to demo so a bare start never needs secrets. */
export function resolveMode(argv = process.argv, env = process.env): 'demo' | 'real' {
  const flag = argv.find((a) => a.startsWith('--mode='))?.split('=')[1];
  const mode = flag ?? env['MCP_MODE'] ?? 'demo';
  if (mode !== 'demo' && mode !== 'real') throw new Error(`Unknown mode "${mode}"`);
  return mode;
}

async function main() {
  const mode = resolveMode();
  const provider = mode === 'demo' ? new DemoGitHubProvider() : new RealGitHubProvider(process.env['GITHUB_TOKEN'] ?? '', process.env['GITHUB_API_URL'] || undefined);
  const server = createGitHubMcpServer(provider, mode);
  await server.connect(new StdioServerTransport());
  console.error(`[mawa-github] MCP server ready (mode=${mode})`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main().catch((err) => {
    console.error('[mawa-github] fatal:', err);
    process.exit(1);
  });
}
