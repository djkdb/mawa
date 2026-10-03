import { serve } from '@hono/node-server';
import { createApp, createDeps } from './app.js';
import { loadConfig, loadDotenv } from './config.js';

loadDotenv();
const config = loadConfig();
const deps = await createDeps(config);
const app = createApp(deps);

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const llm = deps.runs.llmInfo;
  console.log(`[api] listening on http://${config.host}:${info.port}${config.host === '127.0.0.1' ? ' (loopback only; set API_HOST to expose)' : ''}`);
  console.log(`[api] default mode=${config.defaultMode} llm=${llm.provider}/${llm.model}${llm.provider === 'scripted' ? ' (no LLM_API_KEY: scripted heuristics)' : ''}`);
  console.log(`[api] github oauth: ${deps.oauth.status('github')} | google oauth: ${deps.oauth.status('google')} | token store: ${deps.store.persistent ? 'encrypted file' : 'memory only (set SESSION_ENCRYPTION_KEY)'}`);
});
