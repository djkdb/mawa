import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

/** Real-mode stack for e2e/web-real.spec.ts: fresh token store each run, fake GitHub + fake `claude`. */
const REAL_DIR = join(tmpdir(), `mawa-e2e-real-${process.pid}`);
const REAL_API_ENV = {
  AGENT_MODE: 'real', API_PORT: '3002', WEB_ORIGIN: 'http://localhost:4176', API_PUBLIC_URL: 'http://localhost:4176',
  LLM_PROVIDER: 'claude-cli', LLM_API_KEY: '', CLAUDE_BIN: resolve('e2e/fakes/fake-claude.mjs'),
  GITHUB_CLIENT_ID: 'fake-client', GITHUB_CLIENT_SECRET: 'fake-secret', GITHUB_OAUTH_SCOPES: '',
  GITHUB_OAUTH_URL: 'http://localhost:3901', GITHUB_API_URL: 'http://localhost:3901',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  SESSION_ENCRYPTION_KEY: '0'.repeat(64),
  TOKEN_STORE_PATH: join(REAL_DIR, 'tokens.enc.json'), RUN_STORE_PATH: join(REAL_DIR, 'runs.enc.json'), AUDIT_LOG_PATH: join(REAL_DIR, 'audit.jsonl'),
};

/**
 * Browser smoke tests: (1) the API-backed UI with real MCP servers, (2) the
 * portfolio, (3) the standalone browser-only demo build (apps/web/dist-demo),
 * (4) real mode end to end against a fake GitHub (OAuth + REST) and a fake `claude` binary.
 * Run `npm run build && npm run build:demo -w apps/web` first, then `npm run test:e2e`.
 * Set PLAYWRIGHT_CHROMIUM to reuse an installed Chromium instead of downloading one.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      ...(process.env['PLAYWRIGHT_CHROMIUM'] ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM'] } : {}),
      // WebGL for the portfolio's R3F canvas in headless runs.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    { command: 'node apps/api/dist/index.js', port: 3001, reuseExistingServer: false, env: { AGENT_MODE: 'demo', API_PORT: '3001', LLM_API_KEY: '' } },
    { command: 'npm run preview -w apps/web -- --port 4173 --strictPort', port: 4173, reuseExistingServer: false },
    { command: 'npm run preview -w portfolio -- --port 4174 --strictPort', port: 4174, reuseExistingServer: false },
    { command: 'npm run preview:demo -w apps/web -- --port 4175 --strictPort', port: 4175, reuseExistingServer: false },
    { command: 'node e2e/fakes/fake-github.mjs 3901', port: 3901, reuseExistingServer: false },
    { command: 'node apps/api/dist/index.js', port: 3002, reuseExistingServer: false, env: REAL_API_ENV },
    { command: 'npm run preview -w apps/web -- --port 4176 --strictPort', port: 4176, reuseExistingServer: false, env: { VITE_API_URL: 'http://localhost:3002' } },
  ],
});
