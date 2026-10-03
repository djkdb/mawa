import { z } from 'zod';

/** Identifies which MCP server owns a tool. */
export const McpServerIdSchema = z.enum(['github', 'gmail', 'calendar', 'lms']);
export type McpServerId = z.infer<typeof McpServerIdSchema>;

/**
 * A JSON Schema object as exposed by MCP `tools/list`.
 * Kept loose on purpose: the MCP SDK validates shape; we only need to carry it.
 */
export const JsonSchemaSchema = z
  .object({ type: z.literal('object') })
  .passthrough();
export type JsonSchema = z.infer<typeof JsonSchemaSchema>;

/**
 * Tool definition as discovered from an MCP server (`tools/list`), annotated
 * with the owning server so the agent can route `tools/call`.
 */
export const ToolDefinitionSchema = z.object({
  server: McpServerIdSchema,
  name: z.string().min(1),
  description: z.string(),
  inputSchema: JsonSchemaSchema,
  /** MCP tool annotations as reported by the server (hints, not guarantees). */
  annotations: z.object({ readOnlyHint: z.boolean().optional(), destructiveHint: z.boolean().optional(), openWorldHint: z.boolean().optional() }).optional(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

/** Arguments passed to a tool. Each tool narrows this with its own zod schema. */
export const ToolInputSchema = z.record(z.string(), z.unknown());
export type ToolInput = z.infer<typeof ToolInputSchema>;

/**
 * Structured output of a tool. MCP returns `content` blocks; our servers put
 * the typed payload in `structuredContent` and a human-readable summary in
 * `content` so both LLMs and humans can read the result.
 */
export const ToolOutputSchema = z.object({
  summary: z.string(),
  data: z.unknown(),
});
export type ToolOutput = z.infer<typeof ToolOutputSchema>;

/** A request from the agent (usually originating from the LLM) to run a tool. */
export const ToolCallSchema = z.object({
  id: z.string().min(1),
  server: McpServerIdSchema,
  name: z.string().min(1),
  input: ToolInputSchema,
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** The outcome of a ToolCall. Exactly one of `output` / `error` is present. */
export const ToolResultOkSchema = z.object({
  status: z.literal('ok'),
  callId: z.string().min(1),
  output: ToolOutputSchema,
  durationMs: z.number().nonnegative(),
});
export const ToolResultErrorSchema = z.object({
  status: z.literal('error'),
  callId: z.string().min(1),
  error: z.object({ code: z.string(), message: z.string() }),
  durationMs: z.number().nonnegative(),
});
export const ToolResultSchema = z.discriminatedUnion('status', [ToolResultOkSchema, ToolResultErrorSchema]);
export type ToolResultOk = z.infer<typeof ToolResultOkSchema>;
export type ToolResultError = z.infer<typeof ToolResultErrorSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
