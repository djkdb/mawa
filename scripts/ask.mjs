#!/usr/bin/env node
/**
 * Ask the agent from the terminal: real MCP servers over stdio, the LLM from LLM_PROVIDER.
 *
 *   npm run build
 *   LLM_PROVIDER=claude-cli npm run ask -- "앞으로 2주 과제·시험·발표 마감 순서대로 알려줘."
 *   LLM_PROVIDER=anthropic LLM_API_KEY=... npm run ask -- "놓친 거나 막힌 거 있어?"
 *   npm run ask -- --json "..."      # print the report JSON instead
 *
 * --persona=worker serves the fictional worker's week (B사) instead of the student's.
 * Servers run in demo mode (synthetic data) unless --mode=real (then GITHUB_TOKEN / GOOGLE_ACCESS_TOKEN / LMS_TOKEN are needed).
 */
import { fileURLToPath } from 'node:url';
import { McpToolExecutor, createLLMProvider, llmConfigFromEnv, runAgent } from '@mawa/agent-core';

const args = process.argv.slice(2);
const json = args.includes('--json');
const mode = args.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'demo';
const persona = args.find((a) => a.startsWith('--persona='))?.split('=')[1];
const prompt = args.filter((a) => !a.startsWith('--')).join(' ') || '이번 주 공부·개발이랑 팀플 진행 상황 정리해줘.';
const root = new URL('../', import.meta.url);
const ids = persona === 'worker' ? ['github', 'gmail', 'calendar'] : ['github', 'gmail', 'calendar', 'lms'];
const env = { github: ['GITHUB_TOKEN'], gmail: ['GOOGLE_ACCESS_TOKEN'], calendar: ['GOOGLE_ACCESS_TOKEN'], lms: ['LMS_TOKEN', 'LMS_BASE_URL'] };
const servers = ids
  .filter((id) => mode === 'demo' || env[id].some((k) => process.env[k]))
  .map((id) => ({ id, command: process.execPath, args: [fileURLToPath(new URL(`mcp-servers/${id}/dist/index.js`, root))], env: Object.fromEntries(env[id].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) }));
if (!servers.length) { console.error('No MCP server available for --mode=real (set GITHUB_TOKEN, GOOGLE_ACCESS_TOKEN or LMS_TOKEN).'); process.exit(2); }

const llm = createLLMProvider(llmConfigFromEnv());
const dim = (s) => `\x1b[2m${s}\x1b[0m`, bold = (s) => `\x1b[1m${s}\x1b[0m`, color = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const log = (s) => { if (!json) console.log(s); };
log(`${bold('My AI Work Agent')} ${dim(`· ${mode} data · LLM ${llm.id}${llm.id === 'scripted' ? ' (no model)' : ''}`)}`);
log(`${dim('질문')} ${prompt}\n`);
const t0 = Date.now();
const executor = new McpToolExecutor({ servers, mode, clientName: 'mawa-cli', ...(persona ? { persona } : {}) });
const run = await runAgent({
  prompt, mode, llm, executor,
  onEvent: (e) => {
    const t = dim(`+${String(Date.now() - t0).padStart(5)}ms`);
    if (e.type === 'mcp_server_connected') log(`${t} ${color(36, 'MCP')} ${e.serverInfo.name} v${e.serverInfo.version} · ${e.transport} · ${e.protocolVersion}`);
    else if (e.type === 'tool_discovered') log(`${t} ${color(36, 'MCP')} tools/list → ${e.tools.length} tools`);
    else if (e.type === 'llm_request') log(`${t} ${color(35, 'LLM')} ${e.phase} → ${e.provider}/${e.model} · ${(e.bytes / 1024).toFixed(1)}KB · masked ${e.maskedEmails}${e.flagged.length ? ` · flagged ${e.flagged.length}` : ''}`);
    else if (e.type === 'llm_response' && e.toolCalls.length) log(`${t} ${color(35, 'LLM')} plan (${e.model}): ${e.toolCalls.map((c) => c.name.replace('__', '.')).join(', ')}`);
    else if (e.type === 'tool_call_completed') log(`${t} ${color(32, '✓')} ${e.call.server}.${e.call.name} ${dim(JSON.stringify(e.call.input))} → ${e.result.output.summary} ${dim(`${e.result.durationMs}ms`)}`);
    else if (e.type === 'tool_call_failed') log(`${t} ${color(31, '✗')} ${e.call.server}.${e.call.name} → ${e.result.error.message}`);
    else if (e.type === 'report_generated') log(`${t} ${color(33, 'report')} ${e.report.sections.length} sections · dropped ${e.droppedItems}`);
  },
}).finally(() => executor.close());

if (run.error || !run.report) { console.error(`\nrun failed: ${run.error}`); process.exit(1); }
if (json) { console.log(JSON.stringify(run.report, null, 2)); process.exit(0); }
const PRI = { high: color(31, '높음'), medium: color(33, '보통'), low: dim('낮음') };
const TITLE = { overview: '요약', major_activities: '공부·개발 기록', project_progress: 'PR·프로젝트', schedule: '일정·마감', relevant_emails: '챙겨야 할 메일', potential_risks: '놓치면 안 되는 것', next_actions: '할 일' };
for (const s of run.report.sections) {
  log(`\n${bold(TITLE[s.id] ?? s.id)}`);
  for (const i of s.items) log(`  ${i.priority ? `${PRI[i.priority]} ` : ''}${i.category ? dim(`[${i.category}] `) : ''}${i.text}${i.confidence === 'inferred' ? dim(' (추론)') : ''}${i.reason ? dim(`\n      근거: ${i.reason}`) : ''}`);
}
for (const w of run.warnings) log(dim(`! ${w}`));
log(dim(`\n${run.report.sources.length} sources · ${((Date.now() - t0) / 1000).toFixed(1)}s`));
