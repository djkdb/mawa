#!/usr/bin/env node
/**
 * Records ONE run with a real LLM choosing the tools (LLM_PROVIDER / LLM_API_KEY / LLM_MODEL)
 * against the MCP servers in demo mode (synthetic fixtures), and adds it to
 * packages/shared/demo/demo-runs.json as kind "llm". The demo then shows it in
 * 실행 기록 as "실제 LLM 기록 · <model>". Data stays synthetic; only the planner and writer are a model.
 *
 *   LLM_API_KEY=... npm run build && npm run record:llm-run
 *   LLM_PROVIDER=claude-cli npm run record:llm-run   # uses the local Claude Code login
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeDemoAudit } from './lib/demo-audit.mjs';
import { writeEvalResults } from './lib/eval.mjs';
import { McpToolExecutor, createLLMProvider, llmConfigFromEnv, runAgent } from '@mawa/agent-core';

const config = llmConfigFromEnv();
if (config.provider === 'scripted') {
  console.error('BLOCKED: set LLM_API_KEY (and optionally LLM_PROVIDER, LLM_MODEL), or LLM_PROVIDER=claude-cli, to record a real LLM run.');
  process.exit(2);
}
const root = new URL('../', import.meta.url);
const file = new URL('packages/shared/demo/demo-runs.json', root);
const server = (id) => ({ id, command: process.execPath, args: [fileURLToPath(new URL(`mcp-servers/${id}/dist/index.js`, root))] });
const llm = createLLMProvider(config);
const argv = process.argv.slice(2);
const persona = argv.find((a) => a.startsWith('--persona='))?.split('=')[1] ?? 'student';
const id = persona === 'student' ? 'llm-run' : `llm-run-${persona}`;
const prompt = argv.filter((a) => !a.startsWith('--'))[0] ?? (persona === 'worker' ? '다음 주 마감이랑 배포·회의 일정 순서대로 알려줘. 놓치기 쉬운 것도 같이.' : '앞으로 2주 과제·시험·발표 마감 순서대로 알려줘.');
const out = JSON.parse(await readFile(file, 'utf8'));
// Same data policy as the scripted recordings (excluded words, masked addresses).
const dataPolicy = out.policy;
const executor = new McpToolExecutor({ servers: (persona === 'worker' ? ['github', 'gmail', 'calendar'] : ['github', 'gmail', 'calendar', 'lms']).map(server), mode: 'demo', clientName: 'mawa-agent', ...(persona === 'student' ? {} : { persona }) });
const run = await runAgent({ prompt, mode: 'demo', llm, executor, ...(dataPolicy ? { dataPolicy } : {}) }).finally(() => executor.close());
if (run.error || !run.report) { console.error(`run failed: ${run.error}`); process.exit(1); }
out.runs = out.runs.filter((r) => r.id !== id);
out.runs.push({ id, kind: 'llm', persona, prompt, note: `실제 LLM(${llm.id} · ${llm.model})이 도구를 고르고 리포트를 쓴 기록입니다. 데이터는 샘플(--mode=demo)입니다.`, llm: { provider: llm.id, model: llm.model }, recordedAt: new Date().toISOString(), events: run.events, report: run.report, warnings: run.warnings });
await writeFile(file, JSON.stringify(out, null, 2));
await writeDemoAudit(out.runs, new URL('packages/shared/demo/demo-audit.json', root));
await writeEvalResults();
const calls = run.events.filter((e) => e.type === 'tool_call_completed').map((e) => `${e.call.server}.${e.call.name}`);
console.log(`recorded ${id} with ${llm.id}/${llm.model}: ${calls.length} tool calls (${calls.join(', ')}), dropped ${run.events.find((e) => e.type === 'report_generated')?.droppedItems ?? 0}`);
