import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = {
  '/api': { target: process.env['VITE_API_URL'] ?? 'http://localhost:3001', changeOrigin: true },
  '/auth': { target: process.env['VITE_API_URL'] ?? 'http://localhost:3001', changeOrigin: true },
};

/**
 * Two builds from one app:
 *   vite build               → API-backed UI (dev proxy / VITE_API_URL)
 *   vite build --mode demo   → browser-only replay (no API, no LLM key); deploy to any static host
 */
// %VITE_PUBLIC_URL% in index.html resolves to '' when not set, so og/canonical stay root-relative.
process.env['VITE_PUBLIC_URL'] ??= '';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    // Code links point at the branch being built (Cloudflare Pages sets CF_PAGES_BRANCH), else HEAD.
    'import.meta.env.VITE_REPO_REF': JSON.stringify(process.env['VITE_REPO_REF'] ?? process.env['CF_PAGES_BRANCH'] ?? 'HEAD'),
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify(mode === 'demo' ? 'true' : (process.env['VITE_DEMO_MODE'] ?? 'false')),
  },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { port: 5173, proxy },
  preview: { proxy },
}));
