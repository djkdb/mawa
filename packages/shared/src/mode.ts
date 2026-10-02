import { z } from 'zod';

/**
 * Execution mode of the agent pipeline.
 *
 * `demo` — MCP servers serve fixtures and the LLM is scripted. No credentials.
 * `real` — MCP servers call live APIs with the user's OAuth tokens.
 *
 * The mode is a required field on every event and on the report so the UI
 * can never render demo output without a DEMO MODE badge.
 */
export const AgentModeSchema = z.enum(['demo', 'real']);
export type AgentMode = z.infer<typeof AgentModeSchema>;
