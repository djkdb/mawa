import { serve } from '@hono/node-server';
import { createApp, createDeps } from './app.js';
import { loadConfig, loadDotenv } from './config.js';

let config: ReturnType<typeof loadConfig>;
let deps: Awaited<ReturnType<typeof createDeps>>;
try {
  loadDotenv();
  config = loadConfig();
  deps = await createDeps(config);
} catch (err) {
  // Fail loudly: otherwise the web dev server only shows proxy ECONNREFUSED errors.
  console.error(`[api] 시작 실패: ${err instanceof Error ? err.message : String(err)}`);
  console.error('[api] .env 값을 확인하세요: npm run doctor');
  process.exit(1);
}
const app = createApp(deps);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const llm = deps.runs.llmInfo;
  console.log(`[api] listening on http://${config.host}:${info.port}${config.host === '127.0.0.1' ? ' (loopback only; set API_HOST to expose)' : ''}`);
  console.log(`[api] default mode=${config.defaultMode} llm=${llm.provider}/${llm.model}${llm.provider === 'scripted' ? ' (no LLM_API_KEY: scripted heuristics)' : ''}`);
  console.log(`[api] github oauth: ${deps.oauth.status('github')} | google oauth: ${deps.oauth.status('google')} | token store: ${deps.store.persistent ? 'encrypted file' : 'memory only (set SESSION_ENCRYPTION_KEY)'}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `[api] 시작 실패: 포트 ${config.port}이(가) 이미 사용 중입니다. 켜 둔 npm run dev를 끄세요 (npm run doctor).` : `[api] 서버 오류: ${err.message}`);
  process.exit(1);
});
