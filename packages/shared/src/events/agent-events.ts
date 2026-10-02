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
export type ToolDiscovered = z.infer<typeof ToolDiscoveredSchema>;
export type ToolCallStarted = z.infer<typeof ToolCallStartedSchema>;
export type ToolCallCompleted = z.infer<typeof ToolCallCompletedSchema>;
export type ToolCallFailed = z.infer<typeof ToolCallFailedSchema>;
export type ContextAggregated = z.infer<typeof ContextAggregatedSchema>;
export type ReportGenerated = z.infer<typeof ReportGeneratedSchema>;
export type AgentRunCompleted = z.infer<typeof AgentRunCompletedSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent['type'];
