import { describe, expect, it } from 'vitest';
import { runAgent, type LLMProvider, type LLMRequest, type LLMResponse } from '../src/index.js';
import { FakeExecutor } from './fake-executor.js';

/**
 * Proves tool selection is dynamic: the agent passes the discovered tool
 * definitions to the LLM and executes only what the LLM chose. Nothing in
 * the agent hard-codes "weekly report ⇒ call GitHub + Gmail + Calendar".
 */
function choosingLLM(pick: string[]): LLMProvider & { seenTools: string[][] } {
  const seenTools: string[][] = [];
  return {
    id: 'fake',
    model: 'fake',
    seenTools,
    async complete(req: LLMRequest): Promise<LLMResponse> {
      if (req.responseFormat) {
        return { text: JSON.stringify({ sections: [{ id: 'overview', items: [{ text: 'ok', confidence: 'inferred', sources: [] }] }] }), toolCalls: [], stopReason: 'end_turn' };
      }
      seenTools.push((req.tools ?? []).map((t) => t.name));
      if (req.messages.some((m) => m.role === 'tool')) return { text: 'done', toolCalls: [], stopReason: 'end_turn' };
      return { text: '', toolCalls: pick.map((name, i) => ({ id: `c${i}`, name, input: {} })), stopReason: 'tool_use' };
    },
  };
}

describe('dynamic tool selection', () => {
  it('passes every discovered tool definition to the LLM, namespaced by server', async () => {
    const llm = choosingLLM(['github__get_recent_commits']);
    await runAgent({ prompt: 'x', mode: 'demo', llm, executor: new FakeExecutor() });
    expect(llm.seenTools[0]).toEqual(['github__get_recent_commits', 'calendar__get_events', 'gmail__search_project_emails']);
  });

  it('"GitHub only" plan → only the GitHub server is called', async () => {
    const executor = new FakeExecutor();
    const result = await runAgent({ prompt: '이번 주 GitHub 작업만 정리해줘.', mode: 'demo', llm: choosingLLM(['github__get_recent_commits']), executor });
    expect(executor.calls.map((c) => c.server)).toEqual(['github']);
    expect(result.events.filter((e) => e.type === 'tool_call_started')).toHaveLength(1);
  });

  it('"important emails" plan → only Gmail is called', async () => {
    const executor = new FakeExecutor();
    await runAgent({ prompt: '이번 주 중요한 이메일만 알려줘.', mode: 'demo', llm: choosingLLM(['gmail__search_project_emails']), executor });
    expect(executor.calls.map((c) => c.server)).toEqual(['gmail']);
  });

  it('an unknown tool name from the model is rejected, not executed', async () => {
    const executor = new FakeExecutor();
    const result = await runAgent({ prompt: 'x', mode: 'demo', llm: choosingLLM(['slack__post_message']), executor });
    expect(executor.calls).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('unknown tool'))).toBe(true);
  });

  it('tool_discovery_started lists exactly the executor\'s servers', async () => {
    const result = await runAgent({ prompt: 'x', mode: 'demo', llm: choosingLLM([]), executor: new FakeExecutor() });
    const e = result.events.find((x) => x.type === 'tool_discovery_started');
    expect(e && e.type === 'tool_discovery_started' ? e.servers : []).toEqual(['github', 'calendar', 'gmail']);
  });
});
