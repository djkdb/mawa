import type { AgentEvent, AgentMode, WeeklyWorkReport } from '@mawa/shared';

export type IntegrationStatus = 'not_configured' | 'disconnected' | 'connected';

export interface Status {
  defaultMode: AgentMode;
  llm: { provider: string; model: string; isModel: boolean };
  tokenStore: { persistent: boolean };
  integrations: {
    github: { status: IntegrationStatus; account: string | null; connectUrl: string };
    google: { status: IntegrationStatus; account: string | null; connectUrl: string; services: string[] };
  };
  realMode: { available: boolean; servers: string[]; skipped: Array<{ id: string; reason: string }> };
}

export interface RunRecord {
  runId: string;
  mode: AgentMode;
  prompt: string;
  status: 'running' | 'success' | 'error';
  createdAt: string;
  report: WeeklyWorkReport | null;
  warnings: string[];
  error?: string;
  llm: { provider: string; model: string };
}

export interface RunSummary {
  runId: string;
  mode: AgentMode;
  prompt: string;
  status: 'running' | 'success' | 'error';
  createdAt: string;
  toolCalls: number;
  sources: number;
  /** True for runs shipped with the demo (recorded earlier), false for runs started in this session. */
  recorded: boolean;
}

export interface StartRunResult {
  runId: string;
  mode: AgentMode;
  warnings: string[];
}

export interface RunSubscription {
  onEvent: (e: AgentEvent) => void;
  onDone: (status: string) => void;
  onError: (msg: string) => void;
}

/**
 * Everything the UI needs from "the agent". Two implementations:
 *  - HttpClient: talks to apps/api (SSE, OAuth, real or demo runs on the server)
 *  - DemoClient: browser-only replay of recorded runs; no network at all
 */
export interface AgentClient {
  readonly kind: 'http' | 'demo';
  getStatus(): Promise<Status>;
  startRun(prompt: string, mode: AgentMode): Promise<StartRunResult>;
  subscribeRun(runId: string, handlers: RunSubscription): () => void;
  fetchRun(runId: string): Promise<RunRecord>;
  /** Recent runs, newest first (without events). */
  listRuns(): Promise<RunSummary[]>;
  disconnect(provider: 'github' | 'google'): Promise<void>;
}
