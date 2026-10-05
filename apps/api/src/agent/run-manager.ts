import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ChainedAuditLog, McpToolExecutor, MemoryRunStore, createLLMProvider, runAgent, type LLMProvider, type McpServerSpec, type RunRecord, type RunStore } from '@mawa/agent-core';
import { auditRows, type AgentEvent, type AgentMode, type AuditRow, type DataPolicy, type McpServerId } from '@mawa/shared';
import type { OAuthService } from '../auth/oauth.js';
import type { AppConfig } from '../config.js';

const SERVER_ENTRY = (id: McpServerId) => fileURLToPath(new URL(`../../../../mcp-servers/${id}/dist/index.js`, import.meta.url));

export interface StartRunInput {
  prompt: string;
  mode: AgentMode;
  policy?: Partial<DataPolicy>;
  /** Demo mode only: whose synthetic week the servers serve. */
  persona?: 'student' | 'worker';
}

/**
 * Owns run lifecycle: resolves which MCP servers to spawn for the mode,
 * which LLM to use, runs the agent in the background and fans events out
 * to SSE subscribers. One MCP executor per run; servers exit with the run.
 */
export class RunManager {
  private emitter = new EventEmitter();
  private llm: LLMProvider;
  /** Append-only, hash-chained audit of every run; written by the server, not rebuilt for display. */
  readonly audit: ChainedAuditLog<AuditRow>;

  constructor(private readonly config: AppConfig, private readonly oauth: OAuthService, readonly store: RunStore = new MemoryRunStore(), audit?: ChainedAuditLog<AuditRow>) {
    this.llm = createLLMProvider(config.llm);
    this.audit = audit ?? new ChainedAuditLog<AuditRow>(config.auditLogPath);
  }

  /**
   * One tiny request to the configured model, so the UI can say "AI 준비됨" (or why not) before a run.
   * For claude-cli this proves the Claude Code login works; for API providers, the key.
   */
  async checkLlm(timeoutMs = 90_000): Promise<{ ok: boolean; provider: string; model: string; error?: string }> {
    if (this.llm.id === 'scripted') return { ok: true, ...this.llmInfo };
    try {
      await Promise.race([
        this.llm.complete({ system: 'Health check. Reply with the single word: ok', messages: [{ role: 'user', content: 'ok?' }] }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM check timed out')), timeoutMs)),
      ]);
      return { ok: true, ...this.llmInfo };
    } catch (err) {
      return { ok: false, ...this.llmInfo, error: err instanceof Error ? err.message : String(err) };
    }
  }

  get llmInfo() {
    return { provider: this.llm.id, model: this.llm.model };
  }

  /** Which servers would run in each mode, and why some are unavailable. */
  async availableServers(mode: AgentMode, persona?: 'student' | 'worker'): Promise<{ servers: McpServerSpec[]; skipped: Array<{ id: McpServerId; reason: string }> }> {
    const all: McpServerId[] = persona === 'worker' ? ['github', 'gmail', 'calendar'] : ['github', 'gmail', 'calendar', 'lms'];
    if (mode === 'demo') return { servers: all.map((id) => ({ id, command: process.execPath, args: [SERVER_ENTRY(id)] })), skipped: [] };

    const servers: McpServerSpec[] = [];
    const skipped: Array<{ id: McpServerId; reason: string }> = [];
    let gh = null;
    let ghReason = this.oauth.status('github') === 'not_configured' ? 'GitHub OAuth not configured' : 'GitHub not connected';
    if (this.oauth.status('github') === 'connected') {
      try {
        gh = await this.oauth.freshGithubToken();
      } catch (err) {
        ghReason = `GitHub token refresh failed (reconnect GitHub): ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    if (gh) servers.push({ id: 'github', command: process.execPath, args: [SERVER_ENTRY('github')], env: { GITHUB_TOKEN: gh.accessToken, ...(this.config.github.apiUrl !== 'https://api.github.com' ? { GITHUB_API_URL: this.config.github.apiUrl } : {}) } });
    else skipped.push({ id: 'github', reason: ghReason });

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
    const lms = this.oauth.status('lms') === 'connected' ? this.oauth.token('lms') : null;
    if (lms) servers.push({ id: 'lms', command: process.execPath, args: [SERVER_ENTRY('lms')], env: { LMS_TOKEN: lms.accessToken, LMS_BASE_URL: this.config.lms.baseUrl } });
    else skipped.push({ id: 'lms', reason: 'eCampus not connected' });
    return { servers, skipped };
  }

  /**
   * "Why is nothing coming from X?": start that one MCP server in real mode and make a few read calls,
   * so the UI can show what it returns (or the error) without running the whole agent or a model.
   */
  async testSource(id: McpServerId): Promise<{ id: McpServerId; ok: boolean; reason?: string; calls: Array<{ tool: string; ok: boolean; summary?: string; count?: number; error?: string }> }> {
    const { servers, skipped } = await this.availableServers('real');
    const spec = servers.find((s) => s.id === id);
    if (!spec) return { id, ok: false, reason: skipped.find((s) => s.id === id)?.reason ?? 'not connected', calls: [] };
    const PROBES: Record<McpServerId, Array<[string, Record<string, unknown>]>> = {
      github: [['get_repository_activity', {}], ['get_open_issues', { limit: 5 }]],
      gmail: [['search_emails', { query: 'in:inbox', limit: 5 }]],
      calendar: [['get_upcoming_events', { days: 14, limit: 10 }]],
      lms: [['get_courses', {}], ['get_upcoming_deadlines', { days: 30 }], ['get_assignments', { days: 30 }]],
    };
    const executor = new McpToolExecutor({ servers: [spec], mode: 'real', clientName: 'mawa-api-test' });
    const calls: Array<{ tool: string; ok: boolean; summary?: string; count?: number; error?: string }> = [];
    try {
      for (const [name, input] of PROBES[id]) {
        const r = await executor.callTool({ id: `test_${name}`, server: id, name, input });
        if (r.status === 'ok') calls.push({ tool: name, ok: true, summary: r.output.summary, ...(Array.isArray(r.output.data) ? { count: r.output.data.length } : {}) });
        else calls.push({ tool: name, ok: false, error: r.error.message.slice(0, 300) });
      }
    } catch (err) {
      calls.push({ tool: 'connect', ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await executor.close().catch(() => {});
    }
    return { id, ok: calls.length > 0 && calls.every((c) => c.ok), calls };
  }

  async start(input: StartRunInput): Promise<RunRecord> {
    const { servers, skipped } = await this.availableServers(input.mode, input.persona);
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

    const executor = new McpToolExecutor({ servers, mode: input.mode, clientName: 'mawa-api', ...(input.mode === 'demo' && input.persona && input.persona !== 'student' ? { persona: input.persona } : {}) });
    void runAgent({
      runId,
      prompt: input.prompt,
      mode: input.mode,
      llm: this.llm,
      executor,
      ...(input.policy ? { dataPolicy: input.policy } : {}),
      onEvent: (event) => {
        void this.store.appendEvent(runId, event);
        this.emitter.emit(runId, event);
      },
    })
      .then(async (result) => {
        await this.audit.append(auditRows(result.events));
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
