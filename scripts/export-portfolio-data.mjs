#!/usr/bin/env node
/**
 * Generates the portfolio's data snapshots FROM THE REAL CODE so the pitch
 * never drifts from the implementation:
 *   portfolio/src/data/mcp-catalog.json  — tools/list of every MCP server + a sample tools/call output
 *   portfolio/src/data/demo-run.json     — a complete recorded demo run (events + report)
 * Run after `npm run build`: `npm run export:portfolio-data`.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { McpToolExecutor, ScriptedProvider, runAgent } from '@mawa/agent-core';

const root = new URL('../', import.meta.url);
const server = (id) => ({ id, command: process.execPath, args: [fileURLToPath(new URL(`mcp-servers/${id}/dist/index.js`, root))] });
const SAMPLE_INPUT = {
  github__get_recent_commits: { limit: 3 },
  github__get_pull_requests: { state: 'open' },
  github__get_open_issues: { limit: 2 },
  github__get_repository_activity: { limit: 2 },
  gmail__search_emails: { query: 'review', limit: 2 },
  gmail__get_email: { messageId: 'demo0001', bodyMaxChars: 200 },
  gmail__search_project_emails: { keywords: ['my-ai-work-agent'], limit: 2 },
  calendar__get_events: { limit: 2 },
  calendar__get_upcoming_events: { days: 7, limit: 2 },
  calendar__search_events: { query: 'demo', limit: 2 },
};

const executor = new McpToolExecutor({ servers: ['github', 'gmail', 'calendar'].map(server), mode: 'demo', clientName: 'portfolio-export' });
try {
  const tools = await executor.listTools();
  const catalog = { generatedAt: new Date().toISOString(), note: 'Generated from the real MCP servers in demo mode by scripts/export-portfolio-data.mjs. Output examples are DEMO DATA.', servers: {} };
  for (const t of tools) {
    const key = `${t.server}__${t.name}`;
    const result = await executor.callTool({ id: key, server: t.server, name: t.name, input: SAMPLE_INPUT[key] ?? {} });
    const example = result.status === 'ok' ? { summary: result.output.summary, data: Array.isArray(result.output.data) ? result.output.data.slice(0, 2) : result.output.data } : { error: result.error };
    catalog.servers[t.server] ??= { tools: [] };
    catalog.servers[t.server].tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema, sampleInput: SAMPLE_INPUT[key] ?? {}, outputExample: example });
  }
  await writeFile(new URL('portfolio/src/data/mcp-catalog.json', root), JSON.stringify(catalog, null, 2));
  console.log(`catalog: ${tools.length} tools`);

  const run = await runAgent({ prompt: '이번 주 내 개발 프로젝트 진행 상황을 정리해줘.', mode: 'demo', llm: new ScriptedProvider(), executor });
  if (run.error) throw new Error(run.error);
  const demo = { recordedAt: new Date().toISOString(), note: 'Recorded demo run (DEMO MODE, scripted provider, real MCP servers). Replayed in the portfolio, not live.', prompt: '이번 주 내 개발 프로젝트 진행 상황을 정리해줘.', llm: { provider: 'scripted', model: 'scripted-heuristics-v1' }, events: run.events, report: run.report };
  await writeFile(new URL('portfolio/src/data/demo-run.json', root), JSON.stringify(demo, null, 2));
  console.log(`demo run: ${run.events.length} events, ${run.report.sections.length} sections`);
} finally {
  await executor.close();
}
