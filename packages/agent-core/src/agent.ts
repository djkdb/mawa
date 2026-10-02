import { randomUUID } from 'node:crypto';
import type { AgentEvent, AgentMode, ToolCall, ToolDefinition, ToolResult, WeeklyWorkReport } from '@mawa/shared';
import { aggregateContext, type AggregatedContext } from './context/aggregate.js';
import type { LLMMessage, LLMProvider, LLMToolDefinition } from './llm/types.js';
import { AGENT_SYSTEM_PROMPT } from './report/prompt.js';
import { generateReport } from './report/generate.js';
import { qualifiedToolName, splitQualifiedToolName, type ToolExecutor } from './tools/executor.js';
import { isMcpServerId } from './tools/mcp-executor.js';

export interface ToolPolicy {
  /** Max tool calls per run. */
  maxToolCalls: number;
  /** Max LLM planning turns (each may contain several tool calls). */
  maxTurns: number;
  /** Max chars of a tool result placed into the prompt. */
  maxResultChars: number;
  /** Allow-list of qualified tool names; undefined = all discovered tools. */
  allowedTools?: string[];
}

export const DEFAULT_TOOL_POLICY: ToolPolicy = { maxToolCalls: 12, maxTurns: 4, maxResultChars: 12_000 };

export interface RunAgentInput {
  prompt: string;
  mode: AgentMode;
  llm: LLMProvider;
  executor: ToolExecutor;
  runId?: string;
  policy?: Partial<ToolPolicy>;
  period?: { start: string; end: string };
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  now?: () => Date;
}

export interface RunAgentResult {
  runId: string;
  mode: AgentMode;
  report: WeeklyWorkReport | null;
  events: AgentEvent[];
  context: AggregatedContext | null;
  warnings: string[];
  error?: string;
}

/**
 * The agent loop:
 *   discover tools → plan (LLM) → execute (MCP) → … → aggregate → analyze (LLM) → validate.
 * Every transition is emitted as a typed AgentEvent carrying runId, timestamp and mode.
 * Model reasoning is never emitted; only state transitions are.
 */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const runId = input.runId ?? `run_${randomUUID()}`;
  const mode = input.mode;
  const now = input.now ?? (() => new Date());
  const policy: ToolPolicy = { ...DEFAULT_TOOL_POLICY, ...input.policy };
  const events: AgentEvent[] = [];
  const warnings: string[] = [];
  const startedAt = now();

  const emit = <E extends AgentEvent['type']>(type: E, payload: Omit<Extract<AgentEvent, { type: E }>, 'type' | 'runId' | 'timestamp' | 'mode'>) => {
    const event = { type, runId, timestamp: now().toISOString(), mode, ...payload } as Extract<AgentEvent, { type: E }>;
    events.push(event);
    input.onEvent?.(event);
    return event;
  };

  const period = input.period ?? defaultPeriod(now());
  let context: AggregatedContext | null = null;
  let report: WeeklyWorkReport | null = null;

  try {
    emit('agent_run_started', { prompt: input.prompt });

    // 1. Discover tools from every MCP server.
    emit('tool_discovery_started', { servers: ['github', 'gmail', 'calendar'] });
    const discovered = await input.executor.listTools();
    const allowed = discovered.filter((d) => !policy.allowedTools || policy.allowedTools.includes(qualifiedToolName(d)));
    emit('tool_discovered', { tools: allowed });
    const byName = new Map<string, ToolDefinition>(allowed.map((d) => [qualifiedToolName(d), d]));
    const llmTools: LLMToolDefinition[] = allowed.map((d) => ({ name: qualifiedToolName(d), description: d.description, inputSchema: d.inputSchema }));

    // 2. Plan + execute loop.
    const messages: LLMMessage[] = [{ role: 'user', content: `${input.prompt}\n\n(Reporting period: ${period.start} to ${period.end}. Today is ${now().toISOString()}.)` }];
    const executed: Array<{ call: ToolCall; result: ToolResult }> = [];
    let turns = 0;

    while (turns < policy.maxTurns) {
      turns += 1;
      throwIfAborted(input.signal);
      const response = await input.llm.complete({ system: AGENT_SYSTEM_PROMPT, messages, tools: llmTools });
      if (response.stopReason === 'refusal') throw new Error('The model declined the request.');
      messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
      if (response.toolCalls.length === 0) break;

      for (const tc of response.toolCalls) {
        if (executed.length >= policy.maxToolCalls) {
          warnings.push(`Tool-call budget (${policy.maxToolCalls}) reached; skipped ${tc.name}.`);
          messages.push({ role: 'tool', toolCallId: tc.id, content: 'Skipped: tool-call budget exhausted.', isError: true });
          continue;
        }
        const def = byName.get(tc.name);
        const split = splitQualifiedToolName(tc.name);
        if (!def || !split || !isMcpServerId(split.server)) {
          warnings.push(`Model requested unknown tool "${tc.name}".`);
          messages.push({ role: 'tool', toolCallId: tc.id, content: `Unknown tool "${tc.name}".`, isError: true });
          continue;
        }
        const call: ToolCall = { id: tc.id, server: split.server, name: split.name, input: tc.input };
        emit('tool_call_started', { call });
        const result = await input.executor.callTool(call, input.signal);
        executed.push({ call, result });
        if (result.status === 'ok') {
          emit('tool_call_completed', { call, result });
          messages.push({ role: 'tool', toolCallId: tc.id, content: truncate(JSON.stringify(result.output), policy.maxResultChars) });
        } else {
          emit('tool_call_failed', { call, result });
          warnings.push(`${call.server}.${call.name} failed: ${result.error.message}`);
          messages.push({ role: 'tool', toolCallId: tc.id, content: `Error (${result.error.code}): ${result.error.message}`, isError: true });
        }
      }
      if (executed.length >= policy.maxToolCalls) break;
    }

    // 3. Aggregate.
    context = aggregateContext(executed, period);
    emit('context_aggregated', { counts: context.counts, totalItems: context.items.length });

    // 4. Analyze + validate.
    const generated = await generateReport(input.llm, context, { runId, mode, prompt: input.prompt, generatedAt: now().toISOString() });
    report = generated.report;
    warnings.push(...generated.warnings);
    emit('report_generated', { report, droppedItems: generated.droppedItems });

    emit('agent_run_completed', { status: 'success', durationMs: now().getTime() - startedAt.getTime() });
    return { runId, mode, report, events, context, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit('agent_run_completed', { status: 'error', durationMs: now().getTime() - startedAt.getTime(), error: message });
    return { runId, mode, report, events, context, warnings, error: message };
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]` : s;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Run aborted');
}

/** Current ISO week, Monday 00:00 UTC to next Monday. */
export function defaultPeriod(now: Date): { start: string; end: string } {
  const day = (now.getUTCDay() + 6) % 7;
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
  return { start: new Date(monday).toISOString(), end: new Date(monday + 7 * 86_400_000).toISOString() };
}
