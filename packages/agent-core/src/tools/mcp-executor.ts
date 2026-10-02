import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerIdSchema, type AgentMode, type McpServerId, type ToolCall, type ToolDefinition, type ToolResult } from '@mawa/shared';
import type { ToolExecutor } from './executor.js';

export interface McpServerSpec {
  id: McpServerId;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpToolExecutorOptions {
  servers: McpServerSpec[];
  mode: AgentMode;
  /** Per-call timeout in ms. */
  callTimeoutMs?: number;
  clientName?: string;
}

/**
 * The MCP CLIENT layer: one official-SDK Client per MCP server, each spawned
 * as a child process over stdio. Tools are discovered with `tools/list` and
 * executed with `tools/call`. Nothing here knows what the tools do.
 */
export class McpToolExecutor implements ToolExecutor {
  private clients = new Map<McpServerId, Client>();
  private connecting: Promise<void> | null = null;
  private toolCache: ToolDefinition[] | null = null;

  readonly servers: readonly McpServerId[];

  constructor(private readonly options: McpToolExecutorOptions) {
    this.servers = options.servers.map((s) => s.id);
  }

  async connect(): Promise<void> {
    if (!this.connecting) {
      this.connecting = Promise.all(
        this.options.servers.map(async (spec) => {
          const client = new Client({ name: this.options.clientName ?? 'mawa-agent', version: '0.1.0' });
          const transport = new StdioClientTransport({
            command: spec.command,
            args: [...spec.args, `--mode=${this.options.mode}`],
            env: { ...filteredProcessEnv(), ...(spec.env ?? {}) },
            stderr: 'pipe',
          });
          await client.connect(transport);
          this.clients.set(spec.id, client);
        }),
      ).then(() => undefined);
    }
    return this.connecting;
  }

  async listTools(): Promise<ToolDefinition[]> {
    await this.connect();
    if (this.toolCache) return this.toolCache;
    const defs: ToolDefinition[] = [];
    for (const [id, client] of this.clients) {
      const { tools } = await client.listTools();
      for (const t of tools) {
        defs.push({ server: id, name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as ToolDefinition['inputSchema'] });
      }
    }
    this.toolCache = defs;
    return defs;
  }

  async callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    await this.connect();
    const started = Date.now();
    const client = this.clients.get(call.server);
    if (!client) {
      return { status: 'error', callId: call.id, error: { code: 'unknown_server', message: `No MCP server "${call.server}"` }, durationMs: 0 };
    }
    try {
      const res = await client.callTool(
        { name: call.name, arguments: call.input },
        undefined,
        { timeout: this.options.callTimeoutMs ?? 20_000, ...(signal ? { signal } : {}) },
      );
      const durationMs = Date.now() - started;
      if (res.isError) {
        const text = Array.isArray(res.content) ? res.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n') : 'Tool reported an error';
        return { status: 'error', callId: call.id, error: { code: 'tool_error', message: text.slice(0, 2000) }, durationMs };
      }
      const sc = res.structuredContent as { summary?: unknown; data?: unknown } | undefined;
      const summary = typeof sc?.summary === 'string' ? sc.summary : firstText(res.content);
      return { status: 'ok', callId: call.id, output: { summary, data: sc?.data ?? null }, durationMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = /timed? ?out/i.test(message) ? 'timeout' : 'transport_error';
      return { status: 'error', callId: call.id, error: { code, message }, durationMs: Date.now() - started };
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.clients.values()].map((c) => c.close()));
    this.clients.clear();
    this.toolCache = null;
    this.connecting = null;
  }
}

function firstText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const t = content.find((c) => c && typeof c === 'object' && (c as { type?: string }).type === 'text') as { text?: string } | undefined;
  return (t?.text ?? '').split('\n')[0] ?? '';
}

/** Child servers get PATH/HOME etc. but never the API's own secrets. */
function filteredProcessEnv(): Record<string, string> {
  const allow = ['PATH', 'HOME', 'NODE_OPTIONS', 'NODE_ENV', 'TZ', 'LANG', 'SystemRoot', 'TEMP', 'TMP'];
  const out: Record<string, string> = {};
  for (const k of allow) if (process.env[k]) out[k] = process.env[k]!;
  return out;
}

export function isMcpServerId(id: string): id is McpServerId {
  return McpServerIdSchema.safeParse(id).success;
}
