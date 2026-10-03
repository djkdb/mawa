import type { AgentEvent, AgentMode, AuditRow, Chained, ChainCheck, DataPolicy, McpServerId, WeeklyWorkReport } from '@mawa/shared';

export type IntegrationStatus = 'not_configured' | 'disconnected' | 'connected';

export interface Status {
  defaultMode: AgentMode;
  llm: { provider: string; model: string; isModel: boolean };
  tokenStore: { persistent: boolean };
  runStore?: { persistent: boolean };
  api?: { host: string; tokenRequired?: boolean };
  integrations: {
    github: { status: IntegrationStatus; account: string | null; connectUrl: string; scopes?: string[] };
    google: { status: IntegrationStatus; account: string | null; connectUrl: string; services: string[]; scopes?: string[] };
    lms?: { status: IntegrationStatus; account: string | null; connectUrl: string; baseUrl: string };
  };
  realMode: { available: boolean; servers: string[]; skipped: Array<{ id: string; reason: string }> };
  /** The server-owned base policy; a run can only be stricter. */
  policy?: { base: DataPolicy; source: 'default' | 'file' | 'recorded' };
}

/** The stored, hash-chained audit log: written by the server as runs finish (or shipped with the demo). */
export interface AuditLog {
  source: 'server' | 'recorded';
  check?: ChainCheck;
  entries: Array<Chained<AuditRow>>;
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
  /** The run's event trace, when the client has it. */
  events?: AgentEvent[];
  /** Explains a special recording (e.g. the validation demo). */
  note?: string;
}

export interface RunSummary {
  runId: string;
  mode: AgentMode;
  prompt: string;
  status: 'running' | 'success' | 'error';
  createdAt: string;
  toolCalls: number;
  sources: number;
  /** MCP servers the run actually called, in call order. */
  servers: McpServerId[];
  /** True for runs shipped with the demo (recorded earlier), false for runs started in this session. */
  recorded: boolean;
  kind?: 'validation' | 'llm' | 'policy';
  model?: string;
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
  disconnect(provider: 'github' | 'google' | 'lms'): Promise<void>;
  /** The stored audit log (not rebuilt from events). */
  getAudit(): Promise<AuditLog>;
  /** CBNU eCampus (Moodle): exchange id/password for a token on the API server. */
  connectLms?(username: string, password: string): Promise<void>;
}
