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
  ToolDiscoveredSchema,
  ToolCallStartedSchema,
  ToolCallCompletedSchema,
  ToolCallFailedSchema,
  ContextAggregatedSchema,
  ReportGeneratedSchema,
  AgentRunCompletedSchema,
]);

export type AgentRunStarted = z.infer<typeof AgentRunStartedSchema>;
export type ToolDiscoveryStarted = z.infer<typeof ToolDiscoveryStartedSchema>;
export type McpServerConnected = z.infer<typeof McpServerConnectedSchema>;
export type McpMessage = z.infer<typeof McpMessageSchema>;
export type ToolDiscovered = z.infer<typeof ToolDiscoveredSchema>;
export type ToolCallStarted = z.infer<typeof ToolCallStartedSchema>;
export type ToolCallCompleted = z.infer<typeof ToolCallCompletedSchema>;
export type ToolCallFailed = z.infer<typeof ToolCallFailedSchema>;
export type ContextAggregated = z.infer<typeof ContextAggregatedSchema>;
export type ReportGenerated = z.infer<typeof ReportGeneratedSchema>;
export type AgentRunCompleted = z.infer<typeof AgentRunCompletedSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent['type'];
