import { defineConfig } from '@playwright/test';

/**
 * Browser smoke test for the demo pipeline: real API process, real MCP
 * servers, real UI. Run `npm run build` first, then `npm run test:e2e`.
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
  ],
});
