import { z } from 'zod';
import { AgentModeSchema } from '../mode.js';
import {
  McpServerIdSchema,
  ToolCallSchema,
  ToolDefinitionSchema,
  ToolResultErrorSchema,
  ToolResultOkSchema,
} from '../mcp/tool.js';
import { WeeklyWorkReportSchema } from '../report/report.js';

/**
 * Fields present on every event. `mode` is mandatory from the schema level so
 * a consumer can never receive an event without knowing whether it is demo.
 */
const EventBaseSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.iso.datetime(),
  mode: AgentModeSchema,
});

export const AgentRunStartedSchema = EventBaseSchema.extend({
  type: z.literal('agent_run_started'),
  prompt: z.string().min(1),
});

export const ToolDiscoveryStartedSchema = EventBaseSchema.extend({
  type: z.literal('tool_discovery_started'),
  servers: z.array(McpServerIdSchema),
});

/** An MCP client finished the `initialize` handshake with one server. Values come from the server's own response. */
export const McpServerConnectedSchema = EventBaseSchema.extend({
  type: z.literal('mcp_server_connected'),
  server: McpServerIdSchema,
  transport: z.literal('stdio'),
  /** How the server process was launched, with paths made repo-relative. Never includes env. */
  command: z.string(),
  protocolVersion: z.string(),
  serverInfo: z.object({ name: z.string(), version: z.string() }),
  /** Capability keys the server advertised, e.g. ["tools"]. */
  capabilities: z.array(z.string()),
});

/** One JSON-RPC message on a server's stdio pipe, as sent or received by the MCP client. `bytes` is the real size; `preview` is the message with long strings/arrays shortened. */
export const McpMessageSchema = EventBaseSchema.extend({
  type: z.literal('mcp_message'),
  server: McpServerIdSchema,
  direction: z.enum(['client_to_server', 'server_to_client']),
  kind: z.enum(['request', 'response', 'notification', 'error']),
  /** For responses, the method of the request they answer. */
  method: z.string().optional(),
  rpcId: z.union([z.string(), z.number()]).optional(),
  bytes: z.number().int().nonnegative(),
  preview: z.string(),
});

/**
 * What was sent to the LLM on one request: size and categories, never the content itself.
 * `maskedEmails` counts addresses masked before sending; `flagged` lists third-party
 * items whose text looked like instructions to the model (treated as data, shown to the user).
 */
export const LlmRequestSchema = EventBaseSchema.extend({
  type: z.literal('llm_request'),
  phase: z.enum(['plan', 'analysis']),
  provider: z.string(),
  model: z.string(),
  bytes: z.number().int().nonnegative(),
  /** What the payload consists of, e.g. ["사용자 질문", "도구 정의 10개", "도구 결과 4건"]. */
  contents: z.array(z.string()),
  /** Item fields included on the analysis turn. */
  fields: z.array(z.string()).default([]),
  maskedEmails: z.number().int().nonnegative(),
  /** Phone numbers and student numbers (학번) masked before sending. */
  maskedPhones: z.number().int().nonnegative().default(0),
  flagged: z.array(z.object({ sourceId: z.string(), reason: z.string() })).default([]),
});

/** The model's answer on a planning turn: which tools it chose, with what arguments. Text is capped; no hidden reasoning. */
export const LlmResponseSchema = EventBaseSchema.extend({
  type: z.literal('llm_response'),
  phase: z.literal('plan'),
  provider: z.string(),
  model: z.string(),
  stopReason: z.string(),
  text: z.string(),
  toolCalls: z.array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) })),
});

/**
 * A user-defined data policy for one run: which tools the agent may call, which items are kept
 * out of the LLM payload and the report (case-insensitive phrases matched against subject, sender,
 * title, snippet, location), and whether email addresses are masked for the LLM.
 */
export const DataPolicySchema = z.object({
  allowedTools: z.array(z.string().max(80)).max(50).optional(),
  exclude: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  maskEmails: z.boolean().default(true),
  /** Mask phone numbers and student numbers (학번) for the LLM. */
  maskPhones: z.boolean().default(true),
});
export type DataPolicy = z.infer<typeof DataPolicySchema>;

/** What the data policy did in this run. Emitted once, after tool execution. */
export const PolicyAppliedSchema = EventBaseSchema.extend({
  type: z.literal('policy_applied'),
  policy: DataPolicySchema,
  blockedTools: z.array(z.string()),
  /** Calls the model asked for that the policy refused at call time. */
  deniedCalls: z.number().int().nonnegative().default(0),
  excluded: z.array(z.object({ sourceId: z.string(), rule: z.string() })),
});

export const ToolDiscoveredSchema = EventBaseSchema.extend({
  type: z.literal('tool_discovered'),
  tools: z.array(ToolDefinitionSchema),
});

export const ToolCallStartedSchema = EventBaseSchema.extend({
  type: z.literal('tool_call_started'),
  call: ToolCallSchema,
});

export const ToolCallCompletedSchema = EventBaseSchema.extend({
  type: z.literal('tool_call_completed'),
  call: ToolCallSchema,
  result: ToolResultOkSchema,
});

export const ToolCallFailedSchema = EventBaseSchema.extend({
  type: z.literal('tool_call_failed'),
  call: ToolCallSchema,
  result: ToolResultErrorSchema,
});

/**
 * The model asked for a tool the data policy does not allow. The call never reaches the MCP server;
 * the model is told it was refused so it can continue with the tools it has.
 */
export const ToolCallDeniedSchema = EventBaseSchema.extend({
  type: z.literal('tool_call_denied'),
  call: z.object({ id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) }),
  reason: z.enum(['policy']),
});

export const ContextAggregatedSchema = EventBaseSchema.extend({
  type: z.literal('context_aggregated'),
  /** Number of normalized context items per source, e.g. { github: 19, gmail: 8 }. */
  counts: z.partialRecord(McpServerIdSchema, z.number().int().nonnegative()),
  totalItems: z.number().int().nonnegative(),
});

export const ReportGeneratedSchema = EventBaseSchema.extend({
  type: z.literal('report_generated'),
  report: WeeklyWorkReportSchema,
  /** Items dropped because they cited sources that do not exist. */
  droppedItems: z.number().int().nonnegative().default(0),
});

export const AgentRunCompletedSchema = EventBaseSchema.extend({
  type: z.literal('agent_run_completed'),
  status: z.enum(['success', 'error']),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
});

export const AgentEventSchema = z.discriminatedUnion('type', [
  AgentRunStartedSchema,
  ToolDiscoveryStartedSchema,
  McpServerConnectedSchema,
  McpMessageSchema,
  LlmRequestSchema,
  LlmResponseSchema,
  PolicyAppliedSchema,
  ToolDiscoveredSchema,
  ToolCallStartedSchema,
  ToolCallCompletedSchema,
  ToolCallFailedSchema,
  ToolCallDeniedSchema,
  ContextAggregatedSchema,
  ReportGeneratedSchema,
  AgentRunCompletedSchema,
]);

export type AgentRunStarted = z.infer<typeof AgentRunStartedSchema>;
export type ToolDiscoveryStarted = z.infer<typeof ToolDiscoveryStartedSchema>;
export type McpServerConnected = z.infer<typeof McpServerConnectedSchema>;
export type McpMessage = z.infer<typeof McpMessageSchema>;
export type LlmRequest = z.infer<typeof LlmRequestSchema>;
export type LlmResponse = z.infer<typeof LlmResponseSchema>;
export type PolicyApplied = z.infer<typeof PolicyAppliedSchema>;
export type ToolDiscovered = z.infer<typeof ToolDiscoveredSchema>;
export type ToolCallStarted = z.infer<typeof ToolCallStartedSchema>;
export type ToolCallCompleted = z.infer<typeof ToolCallCompletedSchema>;
export type ToolCallFailed = z.infer<typeof ToolCallFailedSchema>;
export type ContextAggregated = z.infer<typeof ContextAggregatedSchema>;
export type ReportGenerated = z.infer<typeof ReportGeneratedSchema>;
export type AgentRunCompleted = z.infer<typeof AgentRunCompletedSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent['type'];
export type ToolCallDenied = z.infer<typeof ToolCallDeniedSchema>;
