import { AgentEventSchema, WeeklyWorkReportSchema } from '@mawa/shared';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { McpToolExecutor, ScriptedProvider, runAgent } from '../src/index.js';

const server = (id: 'github' | 'gmail' | 'calendar' | 'lms') => ({
  id,
  command: process.execPath,
  args: [fileURLToPath(new URL(`../../../mcp-servers/${id}/dist/index.js`, import.meta.url))],
});

/**
 * The real demo pipeline: scripted "LLM" + three real MCP servers spawned
 * over stdio in demo mode. This is exactly what `AGENT_MODE=demo` runs.
 */
describe('runAgent end-to-end over real MCP servers (demo mode)', () => {
  const executor = new McpToolExecutor({ servers: [server('github'), server('gmail'), server('calendar'), server('lms')], mode: 'demo' });
  afterAll(() => executor.close());

  it('discovers 13 tools across 4 servers, calls them, and produces a source-grounded report', async () => {
    const result = await runAgent({ prompt: '이번 주 내 개발 프로젝트 진행 상황을 정리해줘.', mode: 'demo', llm: new ScriptedProvider(), executor });
    expect(result.error).toBeUndefined();

    const discovered = result.events.find((e) => e.type === 'tool_discovered');
    expect(discovered && discovered.type === 'tool_discovered' ? discovered.tools : []).toHaveLength(13);

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
    // Every non-overview item is filed under a category of the student's week.
    const items = report.sections.filter((s) => s.id !== 'overview').flatMap((s) => s.items);
    expect(items.every((i) => typeof i.category === 'string')).toBe(true);
    const catOf = (needle: string) => items.find((i) => i.text.includes(needle))?.category;
    expect(catOf('ERD 확정')).toBe('팀플');
    expect(catOf('baekjoon')).toBe('공부');
    expect(catOf('OG 이미지')).toBe('개발');
    expect(catOf('알고리즘 스터디 6주차')).toBe('모임');
    expect(catOf('코딩테스트')).toBe('취업');

    // The protocol underneath is part of the trace: handshakes reported by each server, then real JSON-RPC traffic.
    for (const e of result.events) expect(AgentEventSchema.safeParse(e).success).toBe(true);
    const hello = result.events.filter((e) => e.type === 'mcp_server_connected');
    expect(hello.map((e) => e.server).sort()).toEqual(['calendar', 'github', 'gmail', 'lms']);
    for (const e of hello) {
      expect(e.serverInfo.name).toBe(`mawa-${e.server}`);
      expect(e.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.capabilities).toContain('tools');
      expect(e.command).toBe(`node mcp-servers/${e.server}/dist/index.js --mode=demo`);
    }
    const wire = result.events.filter((e) => e.type === 'mcp_message');
    const methods = (dir: string, kind: string) => wire.filter((m) => m.direction === dir && m.kind === kind).map((m) => m.method);
    expect(methods('client_to_server', 'request').filter((m) => m === 'initialize')).toHaveLength(4);
    expect(methods('client_to_server', 'request').filter((m) => m === 'tools/list')).toHaveLength(4);
    expect(methods('client_to_server', 'request').filter((m) => m === 'tools/call')).toHaveLength(completed.length);
    expect(methods('server_to_client', 'response').filter((m) => m === 'tools/call')).toHaveLength(completed.length);
    for (const m of wire) expect(() => JSON.parse(m.preview)).not.toThrow();
  }, 30_000);

  it('applies a data policy: excluded rows never reach the context or report, blocked tools are not offered', async () => {
    const result = await runAgent({
      prompt: '이번 주 공부·개발이랑 팀플 진행 상황 정리해줘.', mode: 'demo', llm: new ScriptedProvider(), executor,
      dataPolicy: { exclude: ['엄마'], maskEmails: true, allowedTools: ['github__get_recent_commits', 'gmail__search_project_emails', 'calendar__get_events'] },
    });
    expect(result.error).toBeUndefined();
    const applied = result.events.find((e) => e.type === 'policy_applied');
    expect(applied?.type === 'policy_applied' && applied.excluded).toEqual([{ sourceId: 'gmail:msg:demo0011', rule: '엄마' }]);
    expect(applied?.type === 'policy_applied' && applied.blockedTools).toHaveLength(10);
    expect(result.report!.sources.some((s) => s.id === 'gmail:msg:demo0011')).toBe(false);
    const called = new Set(result.events.flatMap((e) => (e.type === 'tool_call_completed' ? [`${e.call.server}__${e.call.name}`] : [])));
    expect([...called].sort()).toEqual(['calendar__get_events', 'github__get_recent_commits', 'gmail__search_project_emails']);
  }, 30_000);

  it('answers a deadline question with D-day ordered deadlines and the open work behind them', async () => {
    const result = await runAgent({ prompt: '앞으로 2주 과제·시험·발표 마감 순서대로 알려줘.', mode: 'demo', llm: new ScriptedProvider(), executor });
    const schedule = result.report!.sections.find((s) => s.id === 'schedule')!.items;
    expect(schedule[0]!.text).toMatch(/^D-\d+ · .*운영체제 과제2 마감 · .*남은 일: #2/);
    expect(schedule.some((i) => i.text.includes('장학금 신청'))).toBe(true);
    // eCampus: the OS deadline carries my submission status; a deadline only eCampus knows is listed and flagged for the calendar.
    expect(schedule[0]!.text).toContain('임시저장만 됨 (미제출)');
    expect(schedule.some((i) => i.text.includes('실습 보고서 3') && !i.text.includes('남은 일') && i.reason?.includes('캘린더·메일에는 없음'))).toBe(true);
    // A submission due the day before the talk is its own deadline, tied to the slide issue.
    expect(schedule.some((i) => i.text.includes('중간발표 슬라이드 제출') && i.text.includes('남은 일: #13'))).toBe(true);
    expect(result.report!.sections.find((s) => s.id === 'next_actions')!.items.some((i) => i.text.startsWith('나 · 캘린더에 없는 eCampus 마감'))).toBe(true);
    expect(result.report!.sections.find((s) => s.id === 'potential_risks')!.items.some((i) => i.text.startsWith('일정 확인 필요: "캡스톤디자인 중간발표"'))).toBe(true);
  }, 30_000);
});
