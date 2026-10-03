import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse } from './types.js';
import { CONTEXT_BLOCK_END, CONTEXT_BLOCK_START } from '../report/prompt.js';
import { buildScriptedReport, type ScriptedContext } from '../report/scripted-report.js';

/**
 * Deterministic stand-in for an LLM, used in Demo Mode and tests.
 *
 * It is NOT a language model. On the planning turn it requests a fixed set
 * of tools (every tool the servers expose, with default arguments); once tool
 * results are present it stops; on the analysis turn it builds a report from
 * the aggregated context with simple heuristics. The UI labels this provider
 * as "scripted" so nobody mistakes it for model output.
 */
export class ScriptedProvider implements LLMProvider {
  readonly id = 'scripted';
  readonly model = 'scripted-heuristics-v1';

  constructor(private readonly plan?: Array<{ name: string; input?: Record<string, unknown> }>) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.responseFormat) {
      const context = extractContext(request.messages);
      const report = buildScriptedReport(context, context.today ? Date.parse(context.today) : Date.now());
      return { text: JSON.stringify(report), toolCalls: [], stopReason: 'end_turn' };
    }

    const hasToolResults = request.messages.some((m) => m.role === 'tool');
    if (hasToolResults || !request.tools?.length) {
      return { text: 'Collected everything I need.', toolCalls: [], stopReason: 'end_turn' };
    }

    const available = new Set(request.tools.map((t) => t.name));
    const plan = this.plan ?? defaultPlan(request.tools.map((t) => t.name));
    const toolCalls = plan
      .filter((p) => available.has(p.name))
      .map((p, i) => ({ id: `scripted_call_${i + 1}`, name: p.name, input: p.input ?? {} }));
    return { text: '', toolCalls, stopReason: toolCalls.length ? 'tool_use' : 'end_turn' };
  }
}

/** One call per discovered tool, skipping tools that need an id we cannot know up front. */
function defaultPlan(toolNames: string[]) {
  const needsId = new Set(['gmail__get_email']);
  return toolNames
    .filter((n) => !needsId.has(n))
    .map((name) => ({
      name,
      input: name === 'gmail__search_project_emails'
        ? { keywords: ['my-ai-work-agent', 'team-mate', '캡스톤', '과제', '퀴즈', '스터디', '인턴', '코딩테스트', '장학금', '발표'] }
        : name === 'gmail__search_emails'
          ? { query: '마감 OR 제출 OR 리뷰 OR 회의' }
          : name === 'calendar__search_events'
            ? { query: '발표' }
            : name === 'calendar__get_upcoming_events'
              ? { days: 14 }
              : {},
    }));
}

function extractContext(messages: LLMMessage[]): ScriptedContext {
  for (const m of [...messages].reverse()) {
    if (m.role !== 'user') continue;
    const start = m.content.indexOf(CONTEXT_BLOCK_START);
    const end = m.content.indexOf(CONTEXT_BLOCK_END);
    if (start >= 0 && end > start) {
      return JSON.parse(m.content.slice(start + CONTEXT_BLOCK_START.length, end)) as ScriptedContext;
    }
  }
  return { period: { start: '', end: '' }, sources: [], items: [] };
}
