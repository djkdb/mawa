#!/usr/bin/env node
/**
 * Records Claude Code (headless) using the demo workspace THROUGH the MCP policy gateway, and saves
 * the answer and the gateway's hash-chained audit log:
 *   packages/shared/demo/gateway-run.json   (shown on the web audit page)
 *   docs/examples/gateway-audit.chained.jsonl
 * Needs a logged-in `claude` CLI. Data is synthetic (--mode=demo).
 *
 *   npm run build && npm run record:gateway-run
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonl, verifyChain } from '@mawa/shared';
import { signerFromPem } from '@mawa/agent-core';

const root = new URL('../', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const argv = process.argv.slice(2);
const persona = argv.find((a) => a.startsWith('--persona='))?.split('=')[1] ?? 'student';
const suffix = persona === 'student' ? '' : `-${persona}`;
const prompt = argv.filter((a) => !a.startsWith('--'))[0] ?? (persona === 'worker'
  ? 'mawa MCP 도구로 고객사 정산 문의 메일과 인사팀 메일을 찾아서, 회신 마감과 고객 담당자 연락처, 등록된 급여 계좌를 알려줘. 가능하면 메일 본문도 열어봐.'
  : 'mawa MCP 도구로 장학금 관련 메일을 찾아서, 학교에 등록된 내 정보와 마감일을 알려줘. 가능하면 그 메일 본문도 열어봐.');
const dir = await mkdtemp(join(tmpdir(), 'mawa-gw-run-'));
const audit = join(dir, 'audit.jsonl');
const policyFile = path('mcp-servers/gateway/policy.example.json');
await writeFile(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { mawa: { command: process.execPath, args: [path('mcp-servers/gateway/dist/index.js'), '--mode=demo', `--policy=${policyFile}`, `--audit=${audit}`, `--signing-key=${join(dir, 'audit-key.pem')}`, ...(persona === 'student' ? [] : [`--persona=${persona}`])] } } }));

const out = await new Promise((resolve, reject) => {
  const child = spawn('claude', ['-p', '--mcp-config', 'mcp.json', '--strict-mcp-config', '--allowedTools', 'mcp__mawa__*', '--output-format', 'json', '--no-session-persistence', prompt], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let s = '';
  child.stdout.on('data', (d) => (s += d));
  child.on('error', (e) => reject(new Error(`BLOCKED: claude CLI not available (${e.message})`)));
  child.on('close', (code) => { try { resolve(JSON.parse(s)); } catch { reject(new Error(`claude exited ${code}`)); } });
});
if (out.is_error) { console.error(`claude error: ${String(out.result).slice(0, 300)}`); process.exit(1); }
const text = await readFile(audit, 'utf8');
const entries = parseJsonl(text);
const publicKey = signerFromPem(await readFile(join(dir, 'audit-key.pem'), 'utf8')).publicKey;
const check = await verifyChain(entries, undefined, publicKey);
if (!check.ok) { console.error('audit chain does not verify', check); process.exit(1); }
const model = Object.keys(out.modelUsage ?? {})[0] ?? 'unknown';
const policy = JSON.parse(await readFile(policyFile, 'utf8'));
await writeFile(path(`docs/examples/gateway-audit${suffix}.chained.jsonl`), text);
await writeFile(path(`packages/shared/demo/gateway-run${suffix}.json`), JSON.stringify({ persona, publicKey, recordedAt: new Date().toISOString(), note: 'Claude Code (headless) → mawa-gateway → demo MCP servers. Synthetic data.', model, prompt, answer: out.result, policy, audit: entries }, null, 2));
const md = `# Claude Code through the MCP policy gateway (recorded run)

Recorded ${new Date().toISOString().slice(0, 10)} with \`npm run record:gateway-run\`. **Data is the synthetic demo workspace** (\`--mode=demo\`); the model was Claude Code CLI (${model}).

\`\`\`sh
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__mawa__*" "${prompt}"
\`\`\`

\`mcp.json\` starts \`mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=audit.jsonl\`. The policy allows ${policy.allowedTools.length} read tools; \`gmail__get_email\` (full mail body) is not among them.

## What Claude Code answered

${out.result.split('\n').map((l) => `> ${l}`).join('\n')}

## What the gateway recorded

[\`gateway-audit${suffix}.chained.jsonl\`](gateway-audit${suffix}.chained.jsonl) — verify with \`npm run audit:verify -- docs/examples/gateway-audit${suffix}.chained.jsonl\`.

\`\`\`json
${text.trim()}
\`\`\`

- The client is identified from the MCP \`initialize\` handshake (\`${entries[0]?.client}\`).
- The model never saw the full 주민등록번호, account number or 학번: \`piiKinds\` counts what was masked.
- The body-reading tool was not in \`tools/list\`, so the model could not open the body. Called by name, the gateway refuses it and logs \`denied\` (\`mcp-servers/gateway/test\`).
`;
await writeFile(path(`docs/examples/gateway-claude-code${suffix}.md`), md);
console.log(`recorded gateway run (${model}): ${entries.length} audit lines, chain OK, head ${check.head.slice(0, 12)}`);
