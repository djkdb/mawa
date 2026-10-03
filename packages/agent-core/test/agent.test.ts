import { AgentEventSchema, WeeklyWorkReportSchema } from '@mawa/shared';
import { describe, expect, it } from 'vitest';
import { ScriptedProvider, aggregateContext, generateReport, runAgent, type LLMProvider, type LLMRequest, type LLMResponse } from '../src/index.js';
import { FakeExecutor } from './fake-executor.js';

const period = { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' };

describe('runAgent with ScriptedProvider and a fake executor', () => {
  it('runs the full pipeline and emits a valid event sequence', async () => {
    const executor = new FakeExecutor();
    const result = await runAgent({ prompt: '이번 주 진행 상황 정리해줘', mode: 'demo', llm: new ScriptedProvider(), executor, period });

    expect(result.error).toBeUndefined();
    expect(result.report).not.toBeNull();
    expect(WeeklyWorkReportSchema.safeParse(result.report).success).toBe(true);
    for (const e of result.events) {
      expect(AgentEventSchema.safeParse(e).success).toBe(true);
      expect(e.mode).toBe('demo');
      expect(e.runId).toBe(result.runId);
    }
    const types = result.events.map((e) => e.type);
    expect(types[0]).toBe('agent_run_started');
    expect(types).toContain('tool_discovered');
    expect(types.filter((t) => t === 'tool_call_completed')).toHaveLength(3);
    expect(types).toContain('context_aggregated');
    expect(types).toContain('report_generated');
    expect(types.at(-1)).toBe('agent_run_completed');
    expect(executor.calls.map((c) => `${c.server}.${c.name}`).sort()).toEqual(['calendar.get_events', 'github.get_recent_commits', 'gmail.search_project_emails']);
  });

  it('records failed tools as tool_call_failed and still produces a report', async () => {
    const result = await runAgent({ prompt: 'x', mode: 'demo', llm: new ScriptedProvider(), executor: new FakeExecutor(['get_events']), period });
    expect(result.events.some((e) => e.type === 'tool_call_failed')).toBe(true);
    expect(result.report).not.toBeNull();
    expect(result.warnings.some((w) => w.includes('simulated failure'))).toBe(true);
  });

  it('enforces the tool-call budget', async () => {
    const executor = new FakeExecutor();
    const result = await runAgent({ prompt: 'x', mode: 'demo', llm: new ScriptedProvider(), executor, period, policy: { maxToolCalls: 1 } });
    expect(executor.calls).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('budget'))).toBe(true);
  });

  it('restricts tools with an allow-list', async () => {
    const executor = new FakeExecutor();
    await runAgent({ prompt: 'x', mode: 'real', llm: new ScriptedProvider(), executor, period, policy: { allowedTools: ['github__get_recent_commits'] } });
    expect(executor.calls.map((c) => c.name)).toEqual(['get_recent_commits']);
  });
});

describe('generateReport source integrity', () => {
  const fakeLLM = (sections: unknown): LLMProvider => ({
    id: 'fake',
    model: 'fake',
    async complete(_req: LLMRequest): Promise<LLMResponse> {
      return { text: JSON.stringify({ sections }), toolCalls: [], stopReason: 'end_turn' };
    },
  });
  const context = aggregateContext(
    [
      {
        call: { id: 'c', server: 'github', name: 'get_recent_commits', input: {} },
        result: { status: 'ok', callId: 'c', durationMs: 1, output: { summary: '1', data: [{ sourceId: 'github:commit:x/y@abc', repo: 'x/y', sha: 'abc', message: 'feat', date: '2026-10-01T00:00:00.000Z', url: 'https://github.com/x/y/commit/abc' }] } },
      },
    ],
    period,
  );

  it('drops items that cite ids not in the context and counts them', async () => {
    const llm = fakeLLM([
      { id: 'overview', items: [{ text: 'real', confidence: 'observed', sources: ['github:commit:x/y@abc'] }, { text: 'hallucinated', confidence: 'observed', sources: ['github:commit:x/y@nope'] }] },
    ]);
    const { report, droppedItems } = await generateReport(llm, context, { runId: 'r', mode: 'demo', prompt: 'p' });
    expect(droppedItems).toBe(1);
    expect(report.sections[0]!.items.map((i) => i.text)).toEqual(['real']);
  });

  it('downgrades unsourced observed items to inferred', async () => {
    const llm = fakeLLM([{ id: 'next_actions', items: [{ text: 'do X', confidence: 'observed', sources: [] }] }]);
    const { report, warnings } = await generateReport(llm, context, { runId: 'r', mode: 'demo', prompt: 'p' });
    expect(report.sections[0]!.items[0]!.confidence).toBe('inferred');
    expect(warnings[0]).toMatch(/Downgraded/);
  });

  it('rejects malformed model output', async () => {
    await expect(generateReport(fakeLLM('nope'), context, { runId: 'r', mode: 'demo', prompt: 'p' })).rejects.toThrow(/schema/);
  });
});

describe('aggregateContext', () => {
  it('dedupes by sourceId and counts per server', () => {
    const row = { sourceId: 'gmail:msg:1', subject: 's', from: 'f', date: '2026-10-01T00:00:00.000Z', snippet: '' };
    const ok = (id: string) => ({ call: { id, server: 'gmail' as const, name: 'search_emails', input: {} }, result: { status: 'ok' as const, callId: id, durationMs: 1, output: { summary: '', data: [row] } } });
    const ctx = aggregateContext([ok('a'), ok('b')], period);
    expect(ctx.items).toHaveLength(1);
    expect(ctx.counts).toEqual({ gmail: 1 });
    expect(ctx.sources[0]!.id).toBe('gmail:msg:1');
  });

  it('copies only whitelisted display fields into source metadata', () => {
    const row = { sourceId: 'github:pr:o/r#1', repo: 'o/r', number: 1, title: 't', state: 'open', labels: ['bug', 3], reviewComments: 2, body: 'secret-ish long body', token: 'x', sha: 'abcdef0123456789' };
    const ctx = aggregateContext([{ call: { id: 'c', server: 'github' as const, name: 'get_pull_requests', input: {} }, result: { status: 'ok' as const, callId: 'c', durationMs: 1, output: { summary: '', data: [row] } } }], period);
    expect(ctx.sources[0]!.metadata).toEqual({ kind: 'pr', repo: 'o/r', number: 1, state: 'open', labels: ['bug'], reviewComments: 2, sha: 'abcdef0' });
  });
});
