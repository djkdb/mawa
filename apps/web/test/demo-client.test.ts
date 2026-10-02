import { describe, expect, it } from 'vitest';
import { DemoClient, DEMO_EXAMPLES } from '../src/lib/demo-client.js';

describe('DemoClient', () => {
  it('lists session runs before shipped recordings and replays without network', async () => {
    const c = new DemoClient();
    expect((await c.listRuns()).map((r) => r.recorded)).toEqual([true, true, true]);
    const { runId } = await c.startRun(DEMO_EXAMPLES[2]!.prompt, 'demo');
    const list = await c.listRuns();
    expect(list[0]).toMatchObject({ runId, recorded: false, status: 'running', toolCalls: 4 });
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => c.subscribeRun(runId, { onEvent: (e) => events.push(e.type), onDone: () => resolve(), onError: reject }));
    expect(events[0]).toBe('agent_run_started');
    expect(events.at(-1)).toBe('agent_run_completed');
    expect((await c.fetchRun(runId)).status).toBe('success');
    expect((await c.listRuns())[0]?.status).toBe('success');
  }, 30_000);

  it('refuses prompts that were not recorded and real mode', async () => {
    const c = new DemoClient();
    await expect(c.startRun('아무 질문', 'demo')).rejects.toThrow(/기록|recorded/i);
    await expect(c.startRun(DEMO_EXAMPLES[0]!.prompt, 'real')).rejects.toThrow();
  });
});
