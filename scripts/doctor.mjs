#!/usr/bin/env node
/**
 * npm run doctor — 실제 모드 웹 실행(npm run dev) 전 점검. 값은 절대 출력하지 않고 있음/없음/형식만 알려준다.
 *   npm run doctor               .env · 빌드 · claude 위치와 로그인 · 포트
 *   npm run doctor -- --no-login claude 로그인 확인(모델에 짧은 요청 1회)을 건너뜀
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const results = [];
const ok = (msg) => results.push(['ok', msg]);
const warn = (msg, fix) => results.push(['warn', msg, fix]);
const fail = (msg, fix) => results.push(['fail', msg, fix]);

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
if (major >= 22) ok(`Node ${process.versions.node}`); else fail(`Node ${process.versions.node} (22 이상 필요)`, 'https://nodejs.org 에서 LTS 설치');

// 2. .env — keys only, never values
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); ok('.env 있음 (저장소 루트, git에 올라가지 않음)'); } catch (e) { fail(`.env를 읽지 못함: ${e.message}`, '줄마다 KEY=값 형식인지 확인'); }
} else {
  fail('.env 없음', 'copy .env.example .env (PowerShell) 후 docs/REAL_RUN.md 2단계대로 채우기');
}
const env = process.env;
const has = (k) => typeof env[k] === 'string' && env[k].trim() !== '';
if (env.AGENT_MODE === 'real') ok('AGENT_MODE=real'); else warn(`AGENT_MODE=${env.AGENT_MODE || '(없음 → demo)'}`, '.env에 AGENT_MODE=real');
if (env.LLM_PROVIDER === 'claude-cli') ok('LLM_PROVIDER=claude-cli (Claude Code 로그인 사용, API 키 불필요)'); else warn(`LLM_PROVIDER=${env.LLM_PROVIDER || '(없음)'}`, '.env에 LLM_PROVIDER=claude-cli');
if (has('GITHUB_CLIENT_ID')) ok('GITHUB_CLIENT_ID 있음'); else fail('GITHUB_CLIENT_ID 없음', 'GitHub App 화면의 Client ID');
if (has('GITHUB_CLIENT_SECRET')) ok('GITHUB_CLIENT_SECRET 있음'); else fail('GITHUB_CLIENT_SECRET 없음', 'GitHub App 화면에서 Generate a new client secret');
if (!('GITHUB_OAUTH_SCOPES' in env)) warn('GITHUB_OAUTH_SCOPES 줄 없음 → OAuth App 기본값(read:user repo, 쓰기 포함)으로 요청', 'GitHub App이면 .env에 GITHUB_OAUTH_SCOPES= (값 비움)');
else if (has('GITHUB_OAUTH_SCOPES')) warn('GITHUB_OAUTH_SCOPES에 값이 있음 (OAuth App 방식)', 'GitHub App이면 GITHUB_OAUTH_SCOPES= 로 비우기 — 권한은 앱 설정(읽기 전용)에서 정해짐');
else ok('GITHUB_OAUTH_SCOPES= (빈 값 · GitHub App 권한 사용)');
if (!has('SESSION_ENCRYPTION_KEY')) warn('SESSION_ENCRYPTION_KEY 없음 → 연결이 메모리에만 남아 서버를 껐다 켜면 다시 연결해야 함', `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 출력값을 넣기`);
else if (/^[0-9a-fA-F]{64}$/.test(env.SESSION_ENCRYPTION_KEY.trim())) ok('SESSION_ENCRYPTION_KEY 형식 맞음 (64자리 hex)'); else fail('SESSION_ENCRYPTION_KEY 형식 오류 (64자리 hex가 아님)', `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 출력값으로 바꾸기`);
for (const k of ['GITHUB_OAUTH_URL', 'GITHUB_API_URL']) if (has(k)) warn(`${k}가 설정됨 (테스트용 가짜 GitHub 주소)`, `실제 실행이면 .env에서 ${k} 줄 삭제`);
const apiPort = Number(env.API_PORT || 3001);
const publicUrl = env.API_PUBLIC_URL || `http://localhost:${apiPort}`;
ok(`GitHub App Callback URL에 넣을 값: ${publicUrl}/auth/github/callback`);
if ((env.WEB_ORIGIN || 'http://localhost:5173') !== 'http://localhost:5173') warn(`WEB_ORIGIN=${env.WEB_ORIGIN}`, '로컬 실행이면 줄을 지우거나 http://localhost:5173');

// 3. Build output
const built = ['apps/api/dist/index.js', 'packages/agent-core/dist/index.js', 'mcp-servers/github/dist/index.js'].filter((p) => !existsSync(resolve(root, p)));
if (built.length) warn(`빌드 결과 없음: ${built.join(', ')}`, 'npm run build (npm run dev도 처음에 빌드함)'); else ok('빌드 결과 있음');

// 4. claude — the same lookup the API uses
if (env.LLM_PROVIDER === 'claude-cli') {
  let resolveClaudeCommand;
  try { ({ resolveClaudeCommand } = await import('@mawa/agent-core')); } catch { /* not built yet */ }
  if (!resolveClaudeCommand) warn('claude 위치 확인 건너뜀 (agent-core 빌드 전)', 'npm run build 후 다시 실행');
  else {
    const { command, prefix } = resolveClaudeCommand(undefined);
    const shown = prefix.length ? `node ${prefix[0]}` : command;
    const v = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
    if (v.error || v.status !== 0) fail(`claude를 실행하지 못함 (${shown})`, 'Claude Code 설치 확인: claude --version. 경로가 특이하면 .env에 CLAUDE_BIN=<claude.exe 또는 cli.js 경로>');
    else {
      ok(`claude 찾음: ${shown} · ${v.stdout.trim()}`);
      if (args.has('--no-login')) warn('claude 로그인 확인 건너뜀 (--no-login)');
      else {
        // One tiny headless request, the same flags the app uses: proves the login works.
        const p = spawnSync(command, [...prefix, '-p', '--output-format', 'json', '--tools', '', '--no-session-persistence'], { input: 'Reply with: ok', encoding: 'utf8', timeout: 90_000, windowsHide: true });
        let j = null;
        try { j = JSON.parse(p.stdout); } catch { /* not JSON */ }
        if (j && !j.is_error) ok(`claude 로그인 정상 (모델 ${Object.keys(j.modelUsage ?? {})[0] ?? '확인됨'})`);
        else fail(`claude 로그인 실패: ${String(j?.result ?? p.stderr ?? p.error?.message ?? '').trim().slice(0, 160) || '응답 없음'}`, 'claude 실행 → /login → 브라우저에서 승인 → /exit 후 다시 doctor');
      }
    }
  }
}

// 5. Ports
const free = (port) => new Promise((r) => { const s = createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))); s.listen(port, '127.0.0.1'); });
for (const [port, who] of [[apiPort, 'API'], [5173, '웹']]) {
  if ((await free(port))) ok(`포트 ${port} 비어 있음 (${who})`); else fail(`포트 ${port} 사용 중 (${who})`, `이미 켜 둔 npm run dev를 끄거나, Windows: netstat -ano | findstr :${port} 로 PID 확인 후 taskkill /PID <PID> /F`);
}

const icon = { ok: '✓', warn: '!', fail: '✗' };
console.log('\nmawa doctor — 실제 모드 웹 실행 전 점검 (값은 출력하지 않습니다)\n');
for (const [k, msg, fix] of results) console.log(`  ${icon[k]} ${msg}${fix ? `\n      → ${fix}` : ''}`);
const fails = results.filter((r) => r[0] === 'fail').length;
const warns = results.filter((r) => r[0] === 'warn').length;
console.log(`\n${fails ? `✗ 고칠 것 ${fails}개` : '✓ 실행 준비됨'}${warns ? ` · 확인할 것 ${warns}개` : ''}${fails ? '' : ' → npm run dev 후 http://localhost:5173'}\n`);
process.exitCode = fails ? 1 : 0;
