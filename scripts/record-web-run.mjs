#!/usr/bin/env node
/**
 * npm run record:web — runs the web service in REAL mode and records the browser (video only).
 * For headless machines (a cloud session) that cannot click "Authorize" on github.com:
 * GitHub comes from MAWA_GITHUB_TOKEN (read-only fine-grained token, set in the environment —
 * never on the command line or in chat). The LLM is the local Claude Code login (claude-cli)
 * unless LLM_PROVIDER says otherwise.
 *
 * What it does: starts the API (AGENT_MODE=real) and the built web app, opens /?record=1 (account
 * names hidden), shows the connection, asks the question, waits for the real run, opens the report,
 * a source and the data-use page, and saves recordings/mawa-real-run-<time>.webm (+ .mp4 with
 * ffmpeg) and a .json with the run id, start time, model and status. Nothing is staged: if the run
 * fails, the video shows the failure and the script exits 1.
 *
 *   npm run build && npm run record:web -- "이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘."
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prompt = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || '이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘.';
const API_PORT = 3011;
const WEB_PORT = 4181;
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!process.env.MAWA_GITHUB_TOKEN) die('MAWA_GITHUB_TOKEN이 없습니다. 읽기 전용 fine-grained 토큰을 환경 변수로 넣으세요 (docs/REAL_RUN.md 「클라우드 세션에서 녹화」).');
for (const p of ['apps/api/dist/index.js', 'apps/web/dist/index.html', 'mcp-servers/github/dist/index.js']) if (!existsSync(resolve(root, p))) die(`빌드 결과가 없습니다 (${p}). npm run build 먼저.`);
const { chromium } = await import('playwright').catch(() => die('playwright가 없습니다. npm install'));

const work = await mkdtemp(join(tmpdir(), 'mawa-record-'));
const children = [];
const stop = () => { for (const c of children) c.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

function start(name, cmd, args, env, cwd = root) {
  const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  // Our own processes' output only; the token is never printed by them.
  c.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  c.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(c);
  return c;
}
async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  die(`${url} 이(가) 열리지 않았습니다.`);
}

start('api', process.execPath, ['apps/api/dist/index.js'], {
  AGENT_MODE: 'real', LLM_PROVIDER: process.env.LLM_PROVIDER || 'claude-cli', API_PORT: String(API_PORT), API_HOST: '127.0.0.1',
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`, API_PUBLIC_URL: `http://localhost:${WEB_PORT}`,
  // A throwaway store: no OAuth connection, no earlier runs mixed in.
  TOKEN_STORE_PATH: join(work, 'tokens.json'), RUN_STORE_PATH: join(work, 'runs.json'), AUDIT_LOG_PATH: join(work, 'audit.jsonl'),
  GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', SESSION_ENCRYPTION_KEY: '',
});
start('web', process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist', '--port', String(WEB_PORT), '--strictPort'], { VITE_API_URL: `http://127.0.0.1:${API_PORT}` }, resolve(root, 'apps/web'));
await waitFor(`http://127.0.0.1:${API_PORT}/api/health`);
await waitFor(`http://localhost:${WEB_PORT}/`);
const status = await (await fetch(`http://127.0.0.1:${API_PORT}/api/status`)).json();
if (status.integrations.github.status !== 'connected') die('API가 GitHub 연결을 보지 못했습니다 (MAWA_GITHUB_TOKEN).');
if (!status.realMode.available) die(`실제 모드를 쓸 수 없습니다: ${JSON.stringify(status.realMode.skipped)}`);

const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}) });
const size = { width: 1440, height: 900 };
const context = await browser.newContext({ viewport: size, recordVideo: { dir: work, size }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'light' });
// Headless video has no pointer: draw one so viewers can follow the clicks.
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(37,99,235,.35);border:2px solid #2563eb;pointer-events:none;transition:transform .12s;left:-50px;top:-50px';
    document.body.appendChild(dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
  });
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);
async function glide(locator) { const b = await locator.boundingBox(); if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 }); }
async function press(locator) { await locator.scrollIntoViewIfNeeded(); await glide(locator); await pause(250); await locator.click(); }
async function scroll(px, steps = 8) { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await pause(60); } }

let result = { status: 'error', error: 'not started' };
try {
  await page.goto(`http://localhost:${WEB_PORT}/?record=1`);
  await page.getByRole('heading', { level: 2, name: /이번 주/ }).waitFor();
  await page.mouse.move(700, 450);
  await pause(2500);

  // 1. Connection: read-only GitHub, account hidden.
  await press(page.locator('aside').getByRole('link', { name: '연결' }));
  await page.locator('#connections li').filter({ hasText: 'GitHub' }).filter({ hasText: '연결됨' }).waitFor();
  await pause(2500);
  await scroll(500);
  await pause(2500);

  // 2. Ask in real mode.
  await press(page.locator('aside').getByRole('link', { name: '홈' }));
  const real = page.getByRole('radio', { name: '실제' });
  await real.waitFor();
  if ((await real.getAttribute('aria-checked')) !== 'true') await press(real);
  const box = page.locator('#prompt');
  await press(box);
  await box.pressSequentially(prompt, { delay: 45 });
  await pause(800);
  await press(page.getByRole('button', { name: '에이전트 실행' }));

  // 3. The provenance line, then live activity until the run ends (real model: about a minute).
  const banner = page.getByTestId('real-run-banner');
  await banner.waitFor({ timeout: 30_000 });
  await pause(2500);
  const done = banner.filter({ hasText: /완료|실패/ });
  const until = Date.now() + 6 * 60_000;
  while (!(await done.count()) && Date.now() < until) await pause(1000);
  const failed = (await banner.filter({ hasText: '실패' }).count()) > 0;
  if (!(await done.count())) throw new Error('6분 안에 실행이 끝나지 않았습니다.');
  await pause(2000);
  if (failed) {
    await page.getByRole('alert').scrollIntoViewIfNeeded().catch(() => {});
    await pause(4000);
    throw new Error(`실행 실패: ${(await page.getByRole('alert').innerText().catch(() => '')).slice(0, 200)}`);
  }

  // 4. Report, one source, data use.
  await press(page.getByRole('link', { name: '리포트 보기' }));
  await page.getByRole('heading', { level: 2 }).first().waitFor();
  await pause(3000);
  const chip = page.getByRole('button', { name: /^(PR #|이슈 #|커밋 )/ }).first();
  if (await chip.count()) { await press(chip); await pause(3000); await page.keyboard.press('Escape'); }
  await scroll(700, 10);
  await pause(2500);
  await press(page.locator('aside').getByRole('link', { name: 'AI가 본 내 데이터' }));
  await pause(4000);
  await scroll(600, 10);
  await pause(2500);
  result = { status: 'success' };
} catch (err) {
  result = { status: 'error', error: err instanceof Error ? err.message : String(err) };
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const runs = await (await fetch(`http://127.0.0.1:${API_PORT}/api/agent/runs`).catch(() => null))?.json().catch(() => []) ?? [];
  const run = runs[0];
  // The model actually used comes from the run's events (the record's llm is what was configured at start).
  const detail = run ? await (await fetch(`http://127.0.0.1:${API_PORT}/api/agent/runs/${run.runId}`).catch(() => null))?.json().catch(() => null) : null;
  const used = [...(detail?.events ?? [])].reverse().find((e) => e.type === 'llm_response' || e.type === 'llm_request');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(root, 'recordings');
  await mkdir(outDir, { recursive: true });
  const webm = join(outDir, `mawa-real-run-${stamp}.webm`);
  if (video) await rename(await video.path(), webm);
  const meta = { recordedAt: new Date().toISOString(), prompt, script: result, run: run ? { runId: run.runId, mode: run.mode, status: run.status, createdAt: run.createdAt, llm: used ? { provider: used.provider, model: used.model } : run.llm, toolCalls: run.toolCalls, sources: run.sources, servers: run.servers } : null };
  await writeFile(webm.replace(/\.webm$/, '.json'), `${JSON.stringify(meta, null, 2)}\n`);
  let mp4 = null;
  if (spawnSync('ffmpeg', ['-version']).status === 0) {
    mp4 = webm.replace(/\.webm$/, '.mp4');
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    if (r.status !== 0) mp4 = null;
  }
  console.log(`\n${result.status === 'success' ? '✓ 녹화 완료' : `✗ ${result.error}`}`);
  console.log(`  영상: ${mp4 ?? webm}`);
  console.log(`  기록: ${webm.replace(/\.webm$/, '.json')} (runId, 시작 시각, 모델, 상태)`);
  stop();
  process.exit(result.status === 'success' ? 0 : 1);
}
