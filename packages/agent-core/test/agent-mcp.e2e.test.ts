import { WeeklyWorkReportSchema } from '@mawa/shared';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { McpToolExecutor, ScriptedProvider, runAgent } from '../src/index.js';

const server = (id: 'github' | 'gmail' | 'calendar') => ({
  id,
  command: process.execPath,
  args: [fileURLToPath(new URL(`../../../mcp-servers/${id}/dist/index.js`, import.meta.url))],
});

/**
 * The real demo pipeline: scripted "LLM" + three real MCP servers spawned
 * over stdio in demo mode. This is exactly what `AGENT_MODE=demo` runs.
 */
describe('runAgent end-to-end over real MCP servers (demo mode)', () => {
  const executor = new McpToolExecutor({ servers: [server('github'), server('gmail'), server('calendar')], mode: 'demo' });
  afterAll(() => executor.close());

  it('discovers 10 tools, calls them, and produces a source-grounded report', async () => {
    const result = await runAgent({ prompt: '이번 주 내 개발 프로젝트 진행 상황을 정리해줘.', mode: 'demo', llm: new ScriptedProvider(), executor });
    expect(result.error).toBeUndefined();

    const discovered = result.events.find((e) => e.type === 'tool_discovered');
    expect(discovered && discovered.type === 'tool_discovered' ? discovered.tools : []).toHaveLength(10);

    const completed = result.events.filter((e) => e.type === 'tool_call_completed');
    const failed = result.events.filter((e) => e.type === 'tool_call_failed');
    expect(failed).toHaveLength(0);
    expect(completed.length).toBeGreaterThanOrEqual(8);

    expect(result.context!.counts.github).toBeGreaterThanOrEqual(12 + 3 + 4);
    expect(result.context!.counts.gmail).toBeGreaterThanOrEqual(8);
    expect(result.context!.counts.calendar).toBeGreaterThanOrEqual(4);

    const report = result.report!;
    expect(WeeklyWorkReportSchema.safeParse(report).success).toBe(true);
    expect(report.mode).toBe('demo');
    const ids = new Set(report.sources.map((s) => s.id));
    for (const s of report.sections) for (const i of s.items) for (const ref of i.sources) expect(ids.has(ref)).toBe(true);
    expect(report.sections.map((s) => s.id)).toEqual(['overview', 'major_activities', 'project_progress', 'schedule', 'relevant_emails', 'potential_risks', 'next_actions']);
    expect(report.sections.flatMap((s) => s.items).some((i) => i.confidence === 'inferred')).toBe(true);
  }, 30_000);
});
