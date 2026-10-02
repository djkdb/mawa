import { describe, expect, it } from 'vitest';
import {
  AgentEventSchema,
  ReportItemSchema,
  WeeklyWorkReportSchema,
  findDanglingSourceRefs,
  type WeeklyWorkReportInput,
} from '../src/index.js';

const base = (): WeeklyWorkReportInput => ({
  runId: 'run_1',
  mode: 'demo',
  generatedAt: '2026-10-02T00:00:00.000Z',
  period: { start: '2026-09-28T00:00:00.000Z', end: '2026-10-04T23:59:59.000Z' },
  sources: [
    { id: 'github:commit:abc', type: 'github', title: 'feat: scaffold', url: 'https://github.com/x/y/commit/abc' },
    { id: 'calendar:event:1', type: 'calendar', title: 'Sprint review' },
  ],
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      items: [{ id: 'i1', text: 'Scaffolded the workspace.', confidence: 'observed', sources: ['github:commit:abc'] }],
    },
  ],
});

describe('WeeklyWorkReport source integrity', () => {
  it('accepts a report whose items cite existing sources', () => {
    expect(WeeklyWorkReportSchema.safeParse(base()).success).toBe(true);
  });

  it('rejects an item citing a source id that does not exist', () => {
    const report = base();
    report.sections[0]!.items[0]!.sources = ['github:commit:does-not-exist'];
    const result = WeeklyWorkReportSchema.safeParse(report);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/unknown source id/);
      expect(result.error.issues[0]?.path).toEqual(['sections', 0, 'items', 0, 'sources', 0]);
    }
    expect(findDanglingSourceRefs(report)).toEqual(['github:commit:does-not-exist']);
  });

  it('rejects duplicate source ids', () => {
    const report = base();
    report.sources.push({ id: 'github:commit:abc', type: 'github', title: 'dup' });
    expect(WeeklyWorkReportSchema.safeParse(report).success).toBe(false);
  });

  it('requires mode', () => {
    const { mode: _mode, ...noMode } = base();
    expect(WeeklyWorkReportSchema.safeParse(noMode).success).toBe(false);
  });
});

describe('Confidence', () => {
  it('an observed item must cite at least one source', () => {
    expect(ReportItemSchema.safeParse({ id: 'i', text: 't', confidence: 'observed', sources: [] }).success).toBe(false);
    expect(ReportItemSchema.safeParse({ id: 'i', text: 't', confidence: 'observed', sources: ['s'] }).success).toBe(true);
  });

  it('an inferred item may have zero sources', () => {
    expect(ReportItemSchema.safeParse({ id: 'i', text: 't', confidence: 'inferred' }).success).toBe(true);
  });

  it('only observed | inferred are allowed', () => {
    expect(ReportItemSchema.safeParse({ id: 'i', text: 't', confidence: 'guessed', sources: [] }).success).toBe(false);
  });
});

describe('AgentEvent', () => {
  const common = { runId: 'run_1', timestamp: '2026-10-02T00:00:00.000Z' };

  it('every event requires mode', () => {
    expect(AgentEventSchema.safeParse({ ...common, type: 'agent_run_started', prompt: 'hi' }).success).toBe(false);
    expect(AgentEventSchema.safeParse({ ...common, mode: 'real', type: 'agent_run_started', prompt: 'hi' }).success).toBe(true);
  });

  it('rejects unknown modes and event types', () => {
    expect(AgentEventSchema.safeParse({ ...common, mode: 'fake', type: 'agent_run_started', prompt: 'hi' }).success).toBe(false);
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'something_else' }).success).toBe(false);
  });

  it('tool_call_completed carries an ok result only', () => {
    const call = { id: 'c1', server: 'github', name: 'get_recent_commits', input: {} };
    const ok = { status: 'ok', callId: 'c1', output: { summary: '3 commits', data: [] }, durationMs: 12 };
    const err = { status: 'error', callId: 'c1', error: { code: 'E', message: 'boom' }, durationMs: 1 };
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'tool_call_completed', call, result: ok }).success).toBe(true);
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'tool_call_completed', call, result: err }).success).toBe(false);
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'tool_call_failed', call, result: err }).success).toBe(true);
  });

  it('report_generated embeds a validated report', () => {
    const bad = base();
    bad.sections[0]!.items[0]!.sources = ['nope'];
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'report_generated', report: bad }).success).toBe(false);
    expect(AgentEventSchema.safeParse({ ...common, mode: 'demo', type: 'report_generated', report: base() }).success).toBe(true);
  });
});
