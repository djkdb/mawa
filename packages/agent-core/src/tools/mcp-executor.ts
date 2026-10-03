import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { DEMO_NOW, McpServerIdSchema, type AgentMode, type McpServerId, type ToolCall, type ToolDefinition, type ToolResult } from '@mawa/shared';
import type { ToolExecutor, WireEvent } from './executor.js';

const PREVIEW_CHARS = 4000;

/** Shortens long strings and arrays inside a message so the preview stays valid, readable JSON. */
function abbreviate(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 160 ? `${v.slice(0, 160)}… (${v.length}자)` : v;
  if (Array.isArray(v)) {
    const head = v.slice(0, 3).map((x) => abbreviate(x, depth + 1));
    return v.length > 3 ? [...head, `… 외 ${v.length - 3}개`] : head;
  }
  if (v && typeof v === 'object') {
    if (depth > 6) return '{…}';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, abbreviate(x, depth + 1)]));
  }
  return v;
}

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
  /** Demo mode only: the instant the servers treat as now (default DEMO_NOW, or MAWA_NOW from the environment). */
  demoNow?: string;
  /** Demo mode only: whose synthetic workspace the servers serve (MAWA_PERSONA), e.g. "worker". */
  persona?: string;
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
  private wireListeners = new Set<(e: WireEvent) => void>();

  readonly servers: readonly McpServerId[];

  constructor(private readonly options: McpToolExecutorOptions) {
    this.servers = options.servers.map((s) => s.id);
  }

  async connect(): Promise<void> {
    if (!this.connecting) {
      this.connecting = Promise.all(
        this.options.servers.map(async (spec) => {
          const client = new Client({ name: this.options.clientName ?? 'mawa-agent', version: '0.1.0' });
          const args = [...spec.args, `--mode=${this.options.mode}`];
          const stdio = new StdioClientTransport({
            command: spec.command,
            args,
            env: { ...filteredProcessEnv(), ...(this.options.mode === 'demo' ? { MAWA_NOW: this.options.demoNow ?? process.env['MAWA_NOW'] ?? DEMO_NOW, ...(this.options.persona ? { MAWA_PERSONA: this.options.persona } : {}) } : {}), ...(spec.env ?? {}) },
            stderr: 'pipe',
          });
          const tap = new TapTransport(stdio, spec.id, (e) => this.notify(e));
          await client.connect(tap);
          this.clients.set(spec.id, client);
          const info = client.getServerVersion();
          this.notify({
            type: 'mcp_server_connected',
            server: spec.id,
            transport: 'stdio',
            command: displayCommand(spec.command, args),
            protocolVersion: tap.protocolVersion ?? 'unknown',
            serverInfo: { name: info?.name ?? spec.id, version: info?.version ?? 'unknown' },
            capabilities: Object.keys(client.getServerCapabilities() ?? {}),
          });
        }),
      ).then(() => undefined);
    }
    return this.connecting;
  }

  onWire(listener: (e: WireEvent) => void): () => void {
    this.wireListeners.add(listener);
    return () => this.wireListeners.delete(listener);
  }

  private notify(e: WireEvent) {
    for (const l of this.wireListeners) {
      try { l(e); } catch { /* a listener must never break the transport */ }
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    await this.connect();
    if (this.toolCache) return this.toolCache;
    const defs: ToolDefinition[] = [];
    // Iterate in configured order (not Map insertion order, which follows connect completion) so discovery is deterministic.
    for (const id of this.servers) {
      const client = this.clients.get(id);
      if (!client) continue;
      const { tools } = await client.listTools();
      for (const t of tools) {
        const a = t.annotations;
        defs.push({
          server: id, name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as ToolDefinition['inputSchema'],
          ...(a ? { annotations: { ...(a.readOnlyHint !== undefined ? { readOnlyHint: a.readOnlyHint } : {}), ...(a.destructiveHint !== undefined ? { destructiveHint: a.destructiveHint } : {}), ...(a.openWorldHint !== undefined ? { openWorldHint: a.openWorldHint } : {}) } } : {}),
        });
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

/**
 * Wraps the stdio transport and reports every JSON-RPC message that crosses it,
 * in both directions, before handing it on unchanged.
 */
class TapTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  protocolVersion?: string;
  private pending = new Map<string | number, string>();

  constructor(private readonly inner: StdioClientTransport, private readonly server: McpServerId, private readonly report: (e: WireEvent) => void) {
    inner.onmessage = (message: JSONRPCMessage) => {
      this.record('server_to_client', message);
      this.onmessage?.(message);
    };
    inner.onclose = () => this.onclose?.();
    inner.onerror = (error) => this.onerror?.(error);
  }

  start(): Promise<void> { return this.inner.start(); }
  close(): Promise<void> { return this.inner.close(); }
  send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    this.record('client_to_server', message);
    return this.inner.send(message);
  }
  setProtocolVersion(version: string): void { this.protocolVersion = version; }

  private record(direction: 'client_to_server' | 'server_to_client', message: JSONRPCMessage) {
    const m = message as { id?: string | number; method?: string; result?: { protocolVersion?: unknown }; error?: unknown };
    const json = JSON.stringify(message);
    let kind: 'request' | 'response' | 'notification' | 'error';
    let method = m.method;
    if (m.method !== undefined) {
      kind = m.id !== undefined ? 'request' : 'notification';
      if (m.id !== undefined) this.pending.set(m.id, m.method);
    } else {
      kind = m.error !== undefined ? 'error' : 'response';
      if (m.id !== undefined) { method = this.pending.get(m.id); this.pending.delete(m.id); }
      if (method === 'initialize' && typeof m.result?.protocolVersion === 'string') this.protocolVersion = m.result.protocolVersion;
    }
    this.report({
      type: 'mcp_message',
      server: this.server,
      direction,
      kind,
      ...(method ? { method } : {}),
      ...(m.id !== undefined ? { rpcId: m.id } : {}),
      bytes: Buffer.byteLength(json),
      preview: ((p) => (p.length > PREVIEW_CHARS ? `${p.slice(0, PREVIEW_CHARS)}…` : p))(JSON.stringify(abbreviate(message))),
    });
  }
}

/** "node mcp-servers/github/dist/index.js --mode=demo": the launch line without absolute paths. */
function displayCommand(command: string, args: string[]): string {
  const rel = (p: string) => p.replace(/^.*?(mcp-servers\/)/, '$1');
  const bin = /node(\.exe)?$/.test(command) ? 'node' : command.split(/[\\/]/).pop() ?? command;
  return [bin, ...args.map(rel)].join(' ');
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
