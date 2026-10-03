import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { McpToolExecutor, MemoryRunStore, createLLMProvider, runAgent, type LLMProvider, type McpServerSpec, type RunRecord, type RunStore } from '@mawa/agent-core';
import type { AgentEvent, AgentMode, McpServerId } from '@mawa/shared';
import type { OAuthService } from '../auth/oauth.js';
import type { AppConfig } from '../config.js';

const SERVER_ENTRY = (id: McpServerId) => fileURLToPath(new URL(`../../../../mcp-servers/${id}/dist/index.js`, import.meta.url));

export interface StartRunInput {
  prompt: string;
  mode: AgentMode;
}

/**
 * Owns run lifecycle: resolves which MCP servers to spawn for the mode,
 * which LLM to use, runs the agent in the background and fans events out
 * to SSE subscribers. One MCP executor per run; servers exit with the run.
 */
export class RunManager {
  private emitter = new EventEmitter();
  private llm: LLMProvider;

  constructor(private readonly config: AppConfig, private readonly oauth: OAuthService, readonly store: RunStore = new MemoryRunStore()) {
    this.llm = createLLMProvider(config.llm);
  }

  get llmInfo() {
    return { provider: this.llm.id, model: this.llm.model };
  }

  /** Which servers would run in each mode, and why some are unavailable. */
  async availableServers(mode: AgentMode): Promise<{ servers: McpServerSpec[]; skipped: Array<{ id: McpServerId; reason: string }> }> {
    const all: McpServerId[] = ['github', 'gmail', 'calendar'];
    if (mode === 'demo') return { servers: all.map((id) => ({ id, command: process.execPath, args: [SERVER_ENTRY(id)] })), skipped: [] };

    const servers: McpServerSpec[] = [];
    const skipped: Array<{ id: McpServerId; reason: string }> = [];
    const gh = this.oauth.status('github') === 'connected' ? this.oauth.token('github') : null;
    if (gh) servers.push({ id: 'github', command: process.execPath, args: [SERVER_ENTRY('github')], env: { GITHUB_TOKEN: gh.accessToken } });
    else skipped.push({ id: 'github', reason: this.oauth.status('github') === 'not_configured' ? 'GitHub OAuth not configured' : 'GitHub not connected' });

    const google = this.oauth.status('google') === 'connected' ? await this.oauth.freshGoogleToken() : null;
    for (const id of ['gmail', 'calendar'] as const) {
      if (google) {
        servers.push({
          id,
          command: process.execPath,
          args: [SERVER_ENTRY(id)],
          // Only the short-lived access token: the API refreshed it just above (freshGoogleToken),
          // so the refresh token and client secret never leave this process.
          env: { GOOGLE_ACCESS_TOKEN: google.accessToken },
        });
      } else {
        skipped.push({ id, reason: this.oauth.status('google') === 'not_configured' ? 'Google OAuth not configured' : 'Google not connected' });
      }
    }
    return { servers, skipped };
  }

  async start(input: StartRunInput): Promise<RunRecord> {
    const { servers, skipped } = await this.availableServers(input.mode);
    if (input.mode === 'real' && servers.length === 0) {
      throw new Error(`Real mode needs at least one connected integration (${skipped.map((s) => s.reason).join('; ')}). Connect a service or run in demo mode.`);
    }
    const runId = `run_${randomUUID()}`;
    const record: RunRecord = {
      runId,
      mode: input.mode,
      prompt: input.prompt,
      status: 'running',
      createdAt: new Date().toISOString(),
      events: [],
      report: null,
      warnings: skipped.map((s) => `Skipped ${s.id}: ${s.reason}`),
      llm: this.llmInfo,
    };
    await this.store.create(record);

    const executor = new McpToolExecutor({ servers, mode: input.mode, clientName: 'mawa-api' });
    void runAgent({
      runId,
      prompt: input.prompt,
      mode: input.mode,
      llm: this.llm,
      executor,
      onEvent: (event) => {
        void this.store.appendEvent(runId, event);
        this.emitter.emit(runId, event);
      },
    })
      .then(async (result) => {
        await this.store.update(runId, { status: result.error ? 'error' : 'success', report: result.report, warnings: [...record.warnings, ...result.warnings], ...(result.error ? { error: result.error } : {}) });
      })
      .catch(async (err: unknown) => {
        await this.store.update(runId, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        void executor.close();
        this.emitter.emit(`${runId}:done`);
      });

    return record;
  }

  subscribe(runId: string, onEvent: (e: AgentEvent) => void, onDone: () => void): () => void {
    this.emitter.on(runId, onEvent);
    this.emitter.once(`${runId}:done`, onDone);
    return () => {
      this.emitter.off(runId, onEvent);
      this.emitter.off(`${runId}:done`, onDone);
    };
  }
}
