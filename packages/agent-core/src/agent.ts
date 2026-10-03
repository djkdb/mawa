import { randomUUID } from 'node:crypto';
import type { AgentEvent, AgentMode, DataPolicy, ToolCall, ToolDefinition, ToolResult, WeeklyWorkReport } from '@mawa/shared';
import { aggregateContext, type AggregatedContext } from './context/aggregate.js';
import type { LLMMessage, LLMProvider, LLMToolDefinition } from './llm/types.js';
import { AGENT_SYSTEM_PROMPT } from './report/prompt.js';
import { generateReport } from './report/generate.js';
import { detectInjection, excludedBy, promptJson } from './report/guard.js';
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
  /** User-defined data policy: allowed tools, exclusion phrases, masking. */
  dataPolicy?: Partial<DataPolicy>;
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
  const dataPolicy: DataPolicy = { exclude: [], maskEmails: true, ...input.dataPolicy };
  const policy: ToolPolicy = { ...DEFAULT_TOOL_POLICY, ...input.policy, ...(dataPolicy.allowedTools ? { allowedTools: dataPolicy.allowedTools } : {}) };
  const excludedRows: Array<{ sourceId: string; rule: string }> = [];
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
  let unWire: (() => void) | null = null;

  try {
    emit('agent_run_started', { prompt: input.prompt });

    // 1. Discover tools from every MCP server.
    emit('tool_discovery_started', { servers: [...input.executor.servers] });
    // Handshakes and JSON-RPC traffic underneath tool discovery and calls, as recorded by the MCP client.
    unWire = input.executor.onWire?.(({ type, ...payload }) => emit(type, payload as never)) ?? null;
    const discovered = await input.executor.listTools();
    const allowed = discovered.filter((d) => !policy.allowedTools || policy.allowedTools.includes(qualifiedToolName(d)));
    emit('tool_discovered', { tools: allowed });
    const byName = new Map<string, ToolDefinition>(allowed.map((d) => [qualifiedToolName(d), d]));
    const llmTools: LLMToolDefinition[] = allowed.map((d) => ({ name: qualifiedToolName(d), description: d.description, inputSchema: d.inputSchema }));

    // 2. Plan + execute loop.
    const messages: LLMMessage[] = [{ role: 'user', content: `${input.prompt}\n\n(Reporting period: ${period.start} to ${period.end}. Today is ${now().toISOString()}.)` }];
    const executed: Array<{ call: ToolCall; result: ToolResult }> = [];
    let turns = 0;
    let planMasked = 0;
    const flagged = new Map<string, { sourceId: string; reason: string }>();

    while (turns < policy.maxTurns) {
      turns += 1;
      throwIfAborted(input.signal);
      const toolMsgs = messages.filter((m) => m.role === 'tool').length;
      emit('llm_request', {
        phase: 'plan', provider: input.llm.id, model: input.llm.model,
        bytes: Buffer.byteLength(JSON.stringify({ system: AGENT_SYSTEM_PROMPT, messages, tools: llmTools })),
        contents: ['사용자 질문', `도구 정의 ${llmTools.length}개`, ...(toolMsgs ? [`도구 결과 ${toolMsgs}건`] : [])],
        fields: [], maskedEmails: planMasked, flagged: [...flagged.values()],
      });
      const response = await input.llm.complete({ system: AGENT_SYSTEM_PROMPT, messages, tools: llmTools });
      if (response.stopReason === 'refusal') throw new Error('The model declined the request.');
      emit('llm_response', { phase: 'plan', provider: input.llm.id, model: input.llm.model, stopReason: response.stopReason, text: response.text.slice(0, 500), toolCalls: response.toolCalls.map((t) => ({ name: t.name, input: t.input })) });
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
        const raw = await input.executor.callTool(call, input.signal);
        // The data policy keeps matching rows out of everything downstream (LLM payload, context, report).
        let result = raw;
        if (raw.status === 'ok' && Array.isArray(raw.output.data) && dataPolicy.exclude.length) {
          const kept = raw.output.data.filter((row) => {
            const rule = excludedBy(row, dataPolicy.exclude);
            const id = row && typeof row === 'object' ? (row as { sourceId?: unknown }).sourceId : undefined;
            if (rule && typeof id === 'string') excludedRows.push({ sourceId: id, rule });
            return !rule;
          });
          result = { ...raw, output: { ...raw.output, data: kept } };
        }
        executed.push({ call, result });
        if (result.status === 'ok') {
          emit('tool_call_completed', { call, result });
          // Third-party text goes to the model masked, tag-safe, and screened for instructions.
          const json = promptJson(result.output, dataPolicy.maskEmails);
          const masked = { text: truncate(json.text, policy.maxResultChars), count: json.count };
          planMasked += masked.count;
          for (const row of Array.isArray(result.output.data) ? result.output.data : [result.output.data]) {
            if (!row || typeof row !== 'object') continue;
            const r = row as Record<string, unknown>;
            const reason = detectInjection([r['subject'], r['snippet'], r['body'], r['title'], r['description']].filter((x) => typeof x === 'string').join('\n'));
            if (reason && typeof r['sourceId'] === 'string') flagged.set(r['sourceId'], { sourceId: r['sourceId'], reason });
          }
          messages.push({ role: 'tool', toolCallId: tc.id, content: masked.text });
        } else {
          emit('tool_call_failed', { call, result });
          warnings.push(`${call.server}.${call.name} failed: ${result.error.message}`);
          messages.push({ role: 'tool', toolCallId: tc.id, content: `Error (${result.error.code}): ${result.error.message}`, isError: true });
        }
      }
      if (executed.length >= policy.maxToolCalls) break;
    }

    if (input.dataPolicy) emit('policy_applied', { policy: dataPolicy, blockedTools: discovered.filter((d) => !allowed.includes(d)).map(qualifiedToolName), excluded: excludedRows });

    // 3. Aggregate.
    context = aggregateContext(executed, period);
    emit('context_aggregated', { counts: context.counts, totalItems: context.items.length });

    // 4. Analyze + validate.
    const generated = await generateReport(input.llm, context, {
      runId, mode, prompt: input.prompt, generatedAt: now().toISOString(), maskEmails: dataPolicy.maskEmails,
      onPrompt: (p) => emit('llm_request', { phase: 'analysis', provider: input.llm.id, model: input.llm.model, bytes: p.bytes, contents: ['사용자 질문', `출처 ${context!.sources.length}건의 요약과 필드`, '리포트 JSON 스키마'], fields: p.fields, maskedEmails: p.maskedEmails, flagged: [...flagged.values()] }),
    });
    for (const f of flagged.values()) warnings.push(`Suspicious instructions in ${f.sourceId} (${f.reason}); treated as data.`);
    report = generated.report;
    warnings.push(...generated.warnings);
    emit('report_generated', { report, droppedItems: generated.droppedItems });

    emit('agent_run_completed', { status: 'success', durationMs: now().getTime() - startedAt.getTime() });
    return { runId, mode, report, events, context, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit('agent_run_completed', { status: 'error', durationMs: now().getTime() - startedAt.getTime(), error: message });
    return { runId, mode, report, events, context, warnings, error: message };
  } finally {
    unWire?.();
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]` : s;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Run aborted');
}

/**
 * The reporting week in the workspace timezone (Asia/Seoul, UTC+9, no DST): Monday 00:00 to next Monday 00:00.
 * On Mondays the default is the week that just ended, since that is what a Monday update reports on.
 */
export function defaultPeriod(now: Date, tzOffsetHours = 9): { start: string; end: string } {
  const off = tzOffsetHours * 3_600_000;
  const local = new Date(now.getTime() + off);
  const day = (local.getUTCDay() + 6) % 7;
  let monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day) - off;
  if (day === 0) monday -= 7 * 86_400_000;
  return { start: new Date(monday).toISOString(), end: new Date(monday + 7 * 86_400_000).toISOString() };
}
