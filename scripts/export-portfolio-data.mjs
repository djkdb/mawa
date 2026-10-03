#!/usr/bin/env node
/**
 * Generates the demo snapshots FROM THE REAL CODE so the apps never drift
 * from the implementation:
 *   packages/shared/demo/mcp-catalog.json — tools/list of every MCP server + a sample tools/call output
 *   packages/shared/demo/demo-runs.json   — complete recorded runs (events + report), one per example prompt
 * Both apps/web (demo mode) and portfolio import these files.
 * Run after `npm run build`: `npm run export:portfolio-data`.
 */
import { readFile, writeFile } from 'node:fs/promises';
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
  calendar__search_events: { query: '발표', limit: 2 },
  lms__get_courses: {},
  lms__get_upcoming_deadlines: { days: 14, limit: 2 },
  lms__get_assignments: { days: 14, limit: 2 },
};
const KEYWORDS = ['my-ai-work-agent', 'team-mate', '캡스톤', '과제', '퀴즈', '스터디', '인턴', '코딩테스트', '장학금', '발표'];

/** The demo workspace's data policy (Settings shows it): family mail and ads never reach the LLM or the report. */
export const DEMO_POLICY = { exclude: ['엄마', '쿠폰'], maskEmails: true };

/** Example prompts and the tool plan the scripted provider follows for each (a real LLM would choose itself). */
const EXAMPLES = [
  { id: 'weekly-progress', prompt: '이번 주 공부·개발이랑 팀플 진행 상황 정리해줘.', plan: [
    { name: 'github__get_recent_commits', input: {} },
    { name: 'github__get_pull_requests', input: {} },
    { name: 'github__get_open_issues', input: {} },
    { name: 'github__get_repository_activity', input: {} },
    { name: 'gmail__search_project_emails', input: { keywords: KEYWORDS } },
    { name: 'calendar__get_events', input: {} },
    { name: 'calendar__get_upcoming_events', input: { days: 14 } },
    { name: 'lms__get_upcoming_deadlines', input: { days: 14 } },
  ] },
  { id: 'deadlines', prompt: '앞으로 2주 과제·시험·발표 마감 순서대로 알려줘.', plan: [
    { name: 'lms__get_upcoming_deadlines', input: { days: 14 } },
    { name: 'lms__get_assignments', input: { days: 14 } },
    { name: 'calendar__get_upcoming_events', input: { days: 14 } },
    { name: 'gmail__search_emails', input: { query: '마감 OR 제출 OR 퀴즈 OR 시험 OR 발표 OR 신청' } },
    { name: 'github__get_open_issues', input: {} },
  ] },
  { id: 'career', prompt: '인턴 지원이랑 코딩테스트 준비 현황 정리해줘.', plan: [
    { name: 'gmail__search_emails', input: { query: '인턴 OR 채용 OR 코딩테스트 OR 면접' } },
    { name: 'calendar__search_events', input: { query: '코딩테스트' } },
    { name: 'github__get_recent_commits', input: {} },
    { name: 'github__get_open_issues', input: {} },
  ] },
  { id: 'blockers', prompt: '놓친 거나 막힌 거 있어?', plan: [
    { name: 'github__get_open_issues', input: {} },
    { name: 'github__get_pull_requests', input: { state: 'open' } },
    { name: 'gmail__search_project_emails', input: { keywords: KEYWORDS } },
    { name: 'calendar__get_upcoming_events', input: { days: 14 } },
    { name: 'lms__get_assignments', input: { days: 14 } },
  ] },
];

const newExecutor = () => new McpToolExecutor({ servers: ['github', 'gmail', 'calendar', 'lms'].map(server), mode: 'demo', clientName: 'mawa-agent' });
/**
 * Fault injection for the validation demo: the scripted report plus two items a careless model might write —
 * one citing a source id that no tool returned, one claiming "observed" with no source. The run is labelled as such.
 */
class FabricatingProvider extends ScriptedProvider {
  async complete(request) {
    const res = await super.complete(request);
    if (!request.responseFormat) return res;
    const report = JSON.parse(res.text);
    const risks = report.sections.find((x) => x.id === 'potential_risks') ?? report.sections[0];
    risks.items.unshift({ text: '이슈 #99 배포 파이프라인 장애 — 오늘 오전부터 모든 배포 실패', confidence: 'observed', priority: 'high', sources: ['github:issue:demo-user/my-ai-work-agent#99'] });
    risks.items.push({ text: '팀 전체가 이번 주 목표를 달성했습니다', confidence: 'observed', sources: [] });
    return { ...res, text: JSON.stringify(report) };
  }
}
const executor = newExecutor();
try {
  const wire = [];
  const offWire = executor.onWire((e) => wire.push(e));
  const tools = await executor.listTools();
  const catalog = { generatedAt: new Date().toISOString(), note: 'Generated from the real MCP servers in demo mode by scripts/export-portfolio-data.mjs. Output examples are DEMO DATA. `connection` and `wire` are the recorded initialize handshake and JSON-RPC messages.', servers: {} };
  for (const e of wire) if (e.type === 'mcp_server_connected') { const { type: _t, server: id, ...connection } = e; catalog.servers[id] ??= { tools: [] }; catalog.servers[id].connection = connection; }
  for (const t of tools) {
    const key = `${t.server}__${t.name}`;
    const from = wire.length;
    const result = await executor.callTool({ id: key, server: t.server, name: t.name, input: SAMPLE_INPUT[key] ?? {} });
    const example = result.status === 'ok' ? { summary: result.output.summary, data: Array.isArray(result.output.data) ? result.output.data.slice(0, 2) : result.output.data } : { error: result.error };
    const rpc = wire.slice(from).filter((e) => e.type === 'mcp_message').map(({ direction, kind, method, rpcId, bytes, preview }) => ({ direction, kind, method, rpcId, bytes, preview }));
    catalog.servers[t.server] ??= { tools: [] };
    catalog.servers[t.server].tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations, sampleInput: SAMPLE_INPUT[key] ?? {}, outputExample: example, wire: rpc, durationMs: result.durationMs });
  }
  offWire();
  await writeFile(new URL('packages/shared/demo/mcp-catalog.json', root), JSON.stringify(catalog, null, 2));
  console.log(`catalog: ${tools.length} tools`);

  const runs = [];
  for (const ex of EXAMPLES) {
    // One executor per run, like apps/api: each recording includes the initialize handshake and tools/list.
    const runExecutor = newExecutor();
    const run = await runAgent({ prompt: ex.prompt, mode: 'demo', llm: new ScriptedProvider(ex.plan), executor: runExecutor, dataPolicy: DEMO_POLICY }).finally(() => runExecutor.close());
    if (run.error) throw new Error(`${ex.id}: ${run.error}`);
    runs.push({ id: ex.id, prompt: ex.prompt, llm: { provider: 'scripted', model: 'scripted-heuristics-v1' }, events: run.events, report: run.report, warnings: run.warnings });
    console.log(`run ${ex.id}: ${run.events.length} events, ${run.report.sources.length} sources, ${run.report.sections.length} sections`);
  }
  {
    const prompt = EXAMPLES[3].prompt;
    const runExecutor = newExecutor();
    const run = await runAgent({ prompt, mode: 'demo', llm: new FabricatingProvider(EXAMPLES[3].plan), executor: runExecutor }).finally(() => runExecutor.close());
    if (run.error) throw new Error(`validation-demo: ${run.error}`);
    runs.push({ id: 'validation-demo', kind: 'validation', prompt, note: '출처 검증 시연: 리포트 단계에 존재하지 않는 출처를 인용한 항목 1건과 출처 없는 "확인됨" 항목 1건을 일부러 주입한 기록입니다.', llm: { provider: 'scripted', model: 'scripted-heuristics-v1 + fault injection' }, events: run.events, report: run.report, warnings: run.warnings });
    console.log(`run validation-demo: dropped ${run.events.find((e) => e.type === 'report_generated')?.droppedItems}`);
  }
  // Keep a real-LLM recording made with `npm run record:llm-run`; this script never fabricates one.
  try {
    const prev = JSON.parse(await readFile(new URL('packages/shared/demo/demo-runs.json', root), 'utf8'));
    runs.push(...prev.runs.filter((r) => r.kind === 'llm'));
  } catch { /* first export */ }
  const out = { recordedAt: new Date().toISOString(), policy: DEMO_POLICY, note: 'Recorded demo runs (DEMO MODE, scripted provider, real MCP servers over stdio, synthetic fixtures). Replayed by apps/web in demo mode and by the portfolio. Not live, not real data.', runs };
  await writeFile(new URL('packages/shared/demo/demo-runs.json', root), JSON.stringify(out, null, 2));
} finally {
  await executor.close();
}
