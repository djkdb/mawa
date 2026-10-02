import type { ToolCall, ToolDefinition, ToolResult } from '@mawa/shared';

/**
 * What the agent needs from the outside world. The production implementation
 * is McpToolExecutor (real MCP clients over stdio); tests use an in-memory fake.
 */
export interface ToolExecutor {
  listTools(): Promise<ToolDefinition[]>;
  callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult>;
  close(): Promise<void>;
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
