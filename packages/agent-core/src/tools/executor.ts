import type { McpMessage, McpServerConnected, McpServerId, ToolCall, ToolDefinition, ToolResult } from '@mawa/shared';

type Payload<T> = Omit<T, 'type' | 'runId' | 'timestamp' | 'mode'>;
/** What an executor can report about the protocol underneath: handshakes and individual JSON-RPC messages. */
export type WireEvent =
  | ({ type: 'mcp_server_connected' } & Payload<McpServerConnected>)
  | ({ type: 'mcp_message' } & Payload<McpMessage>);

/**
 * What the agent needs from the outside world. The production implementation
 * is McpToolExecutor (real MCP clients over stdio); tests use an in-memory fake.
 */
export interface ToolExecutor {
  /** Servers this executor will talk to; reported in tool_discovery_started. */
  readonly servers: readonly McpServerId[];
  listTools(): Promise<ToolDefinition[]>;
  callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult>;
  close(): Promise<void>;
  /** Optional protocol tap. Returns an unsubscribe function. Fakes without a wire can omit it. */
  onWire?(listener: (e: WireEvent) => void): () => void;
}

/** Tool names are namespaced as `<server>__<tool>` when exposed to the LLM. */
export function qualifiedToolName(def: Pick<ToolDefinition, 'server' | 'name'>): string {
  return `${def.server}__${def.name}`;
}

export function splitQualifiedToolName(qualified: string): { server: string; name: string } | null {
  const idx = qualified.indexOf('__');
  if (idx <= 0) return null;
  return { server: qualified.slice(0, idx), name: qualified.slice(idx + 2) };
}
