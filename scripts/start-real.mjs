#!/usr/bin/env node
/**
 * npm run start:real — one command for a real-mode session on your own machine:
 * build → npm run doctor (stops on ✗) → API from the build output (node, not tsx watch: also the
 * path that works on Windows) + the web app (vite dev on :5173). Ctrl+C stops both.
 *   npm run start:real               full check, including one tiny Claude Code login request
 *   npm run start:real -- --no-login skip the login request
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pass = process.argv.slice(2);
const step = (title) => console.log(`\n▶ ${title}`);

step('빌드 (npm run build)');
if (spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true }).status !== 0) process.exit(1);

step('점검 (npm run doctor)');
if (spawnSync(process.execPath, [resolve(root, 'scripts/doctor.mjs'), ...pass], { cwd: root, stdio: 'inherit' }).status !== 0) {
  console.error('\n✗ doctor가 고칠 것을 찾았습니다. 위 → 안내대로 고친 뒤 다시 실행하세요.');
  process.exit(1);
}

step('실행: API :3001 + 웹 http://localhost:5173  (Ctrl+C로 종료)');
const kids = [];
function run(name, cmd, args, cwd) {
  const c = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = (d) => String(d).split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  c.stdout.on('data', (d) => process.stdout.write(tag(d)));
  c.stderr.on('data', (d) => process.stderr.write(tag(d)));
  c.on('exit', (code) => { if (code && code !== 0) { console.error(`[${name}] 종료 (코드 ${code}) — 위 로그를 확인하세요.`); stop(); } });
  kids.push(c);
}
function stop() { for (const c of kids) c.kill(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
run('api', process.execPath, [resolve(root, 'apps/api/dist/index.js')], root);
run('web', process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', '5173', '--strictPort'], resolve(root, 'apps/web'));
