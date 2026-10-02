import type { ToolCall, ToolDefinition, ToolResult } from '@mawa/shared';
import type { ToolExecutor } from '../src/index.js';

export const fakeTools: ToolDefinition[] = [
  { server: 'github', name: 'get_recent_commits', description: 'commits', inputSchema: { type: 'object', properties: {} } },
  { server: 'calendar', name: 'get_events', description: 'events', inputSchema: { type: 'object', properties: {} } },
  { server: 'gmail', name: 'search_project_emails', description: 'emails', inputSchema: { type: 'object', properties: { keywords: { type: 'array' } } } },
];

export class FakeExecutor implements ToolExecutor {
  calls: ToolCall[] = [];
  constructor(private failing: string[] = []) {}
  async listTools() {
    return fakeTools;
  }
  async callTool(call: ToolCall): Promise<ToolResult> {
    this.calls.push(call);
    if (this.failing.includes(call.name)) {
      return { status: 'error', callId: call.id, error: { code: 'boom', message: 'simulated failure' }, durationMs: 1 };
    }
    const data =
      call.name === 'get_recent_commits'
        ? [{ sourceId: 'github:commit:x/y@abc', repo: 'x/y', sha: 'abc', message: 'feat: thing', date: '2026-10-01T10:00:00.000Z', url: 'https://github.com/x/y/commit/abc' }]
        : call.name === 'get_events'
          ? [{ sourceId: 'calendar:event:e1', title: 'Standup', start: '2026-10-02T09:00:00.000Z', end: '2026-10-02T09:15:00.000Z' }]
          : [{ sourceId: 'gmail:msg:m1', subject: 'Re: thing', from: 'a@b.c', date: '2026-10-01T12:00:00.000Z', snippet: 'ok' }];
    return { status: 'ok', callId: call.id, output: { summary: `${data.length} rows`, data }, durationMs: 2 };
  }
  async close() {}
}
