import { describe, expect, it } from 'vitest';
import { DemoClient, DEMO_EXAMPLES } from '../src/lib/demo-client.js';

describe('DemoClient', () => {
  it('lists session runs before shipped recordings and replays without network', async () => {
    const c = new DemoClient();
    const shipped = await c.listRuns();
    expect(shipped.map((r) => r.recorded)).toEqual([true, true, true, true, true, true, true, true]);
    // The policy demo: the same question with no policy and under a strict one.
    expect(shipped.filter((r) => r.kind === 'policy').map((r) => r.runId)).toEqual(['recorded_policy-off', 'recorded_policy-strict']);
    // One run was recorded with a real model choosing the tools; it is labelled, not offered as an example.
    expect(shipped.filter((r) => r.kind === 'llm')).toEqual([expect.objectContaining({ runId: 'recorded_llm-run', model: expect.stringMatching(/\S/) })]);
    // The fault-injection recording is listed but never offered as an example question.
    expect(shipped.filter((r) => r.kind === 'validation')).toHaveLength(1);
    expect(DEMO_EXAMPLES).toHaveLength(4);
    const { runId } = await c.startRun(DEMO_EXAMPLES[2]!.prompt, 'demo');
    const list = await c.listRuns();
    expect(list[0]).toMatchObject({ runId, recorded: false, status: 'running', toolCalls: 4 });
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => c.subscribeRun(runId, { onEvent: (e) => events.push(e.type), onDone: () => resolve(), onError: reject }));
    expect(events[0]).toBe('agent_run_started');
    expect(events.at(-1)).toBe('agent_run_completed');
    expect((await c.fetchRun(runId)).status).toBe('success');
    expect(events).toContain('mcp_server_connected');
    expect(events).toContain('llm_request');
    expect((await c.listRuns())[0]?.status).toBe('success');
  }, 30_000);

  it('refuses prompts that were not recorded and real mode', async () => {
    const c = new DemoClient();
    await expect(c.startRun('아무 질문', 'demo')).rejects.toThrow(/기록|recorded/i);
    await expect(c.startRun(DEMO_EXAMPLES[0]!.prompt, 'real')).rejects.toThrow();
  });
});
