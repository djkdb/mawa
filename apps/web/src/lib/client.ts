import { DemoClient } from './demo-client.js';
import { HttpClient } from './http-client.js';
import type { AgentClient } from './types.js';

export * from './types.js';
export { DEMO_EXAMPLES, DEMO_RECORDED_AT } from './demo-client.js';

/** `vite build --mode demo` (or VITE_DEMO_MODE=true) ships the browser-only replay; otherwise the API client. */
export const IS_DEMO_BUILD = String(import.meta.env['VITE_DEMO_MODE'] ?? 'false') === 'true';

export const PORTFOLIO_URL = (import.meta.env['VITE_PORTFOLIO_URL'] as string | undefined) || null;
export const REPO_URL = 'https://github.com/djkdb/mawa';

let instance: AgentClient | null = null;
export function getClient(): AgentClient {
  instance ??= IS_DEMO_BUILD ? new DemoClient() : new HttpClient();
  return instance;
}
