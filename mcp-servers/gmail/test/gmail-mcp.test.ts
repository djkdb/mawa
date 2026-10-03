import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectQuery } from '../src/types.js';

describe('Gmail MCP server (demo mode, stdio)', () => {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mode=demo'], stderr: 'pipe' }));
  }, 20_000);
  afterAll(() => client.close());

  it('lists three tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_email', 'search_emails', 'search_project_emails']);
  });

  it('search_project_emails finds the 10 relevant demo emails for the student keywords and skips promotions', async () => {
    const res = await client.callTool({ name: 'search_project_emails', arguments: { keywords: ['my-ai-work-agent', 'team-mate', '캡스톤', '과제', '퀴즈', '스터디', '인턴', '코딩테스트', '장학금', '발표'] } });
    const sc = res.structuredContent as { data: Array<{ sourceId: string; subject: string }> };
    expect(sc.data).toHaveLength(10);
    expect(sc.data.every((e) => e.sourceId.startsWith('gmail:msg:'))).toBe(true);
    expect(sc.data.some((e) => e.subject.includes('쿠폰'))).toBe(false);
  });

  it('get_email returns a body and respects bodyMaxChars', async () => {
    const res = await client.callTool({ name: 'get_email', arguments: { messageId: 'demo0001', bodyMaxChars: 100 } });
    const sc = res.structuredContent as { data: { body: string; truncated: boolean } };
    expect(sc.data.body.length).toBe(100);
    expect(sc.data.truncated).toBe(true);
    const missing = await client.callTool({ name: 'get_email', arguments: { messageId: 'nope' } });
    expect((missing.structuredContent as { data: unknown }).data).toBeNull();
  });

  it('projectQuery quotes multi-word keywords and excludes promotions', () => {
    expect(projectQuery(['my-ai-work-agent', 'demo day'])).toBe('(my-ai-work-agent OR "demo day") -category:promotions -category:social');
  });
});
