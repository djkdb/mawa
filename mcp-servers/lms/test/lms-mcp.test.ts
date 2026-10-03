import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MoodleLmsProvider, moodleToken } from '../src/index.js';

describe('LMS MCP server (demo mode, stdio)', () => {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, '--mode=demo'], stderr: 'pipe' }));
  }, 20_000);
  afterAll(() => client.close());

  it('lists three read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_assignments', 'get_courses', 'get_upcoming_deadlines']);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('returns upcoming deadlines soonest first and assignment submission status', async () => {
    const d = (await client.callTool({ name: 'get_upcoming_deadlines', arguments: { days: 14 } })).structuredContent as { data: Array<{ title: string; due: string; sourceId: string }> };
    expect(d.data.map((x) => x.title)).toEqual(['과제2: CPU 스케줄링', '퀴즈2: 정규화', '실습 보고서 3: TCP 혼잡 제어', '중간발표 슬라이드 제출']);
    expect(d.data.every((x) => x.sourceId.startsWith('lms:due:'))).toBe(true);
    const a = (await client.callTool({ name: 'get_assignments', arguments: { days: 14 } })).structuredContent as { summary: string; data: Array<{ submission: string }> };
    expect(a.summary).toBe('3 assignments due, 3 not submitted');
    expect(a.data[0]!.submission).toBe('draft');
  });
});

describe('Moodle provider (against a fake Moodle)', () => {
  const calls: Array<{ fn: string | null; body: string }> = [];
  const fake = (async (_url: string, init?: RequestInit) => {
    const body = String(init?.body);
    const fn = new URLSearchParams(body).get('wsfunction');
    calls.push({ fn, body });
    const json =
      fn === 'core_webservice_get_site_info' ? { userid: 7 } :
      fn === 'core_enrol_get_users_courses' ? [{ id: 1, shortname: 'OS', fullname: '운영체제' }] :
      fn === 'core_calendar_get_action_events_by_timesort' ? { events: [{ id: 5, name: '과제2', modulename: 'assign', timesort: 1_800_000_000, course: { id: 1, fullname: '운영체제' }, action: { name: '과제 제출', url: 'https://lms.example/mod/assign/view.php?id=5' } }] } :
      fn === 'mod_assign_get_assignments' ? { courses: [{ id: 1, fullname: '운영체제', assignments: [{ id: 9, cmid: 5, name: '과제2', duedate: 1_800_000_000 }] }] } :
      fn === 'mod_assign_get_submission_status' ? { lastattempt: { submission: { status: 'draft' } } } :
      { exception: 'x', errorcode: 'nope' };
    return new Response(JSON.stringify(json), { status: 200 });
  }) as unknown as typeof fetch;

  it('maps Moodle web-service responses and sends the token only in the POST body', async () => {
    const p = new MoodleLmsProvider('https://lms.example', 'tok-123', fake);
    expect(await p.getCourses()).toEqual([{ sourceId: 'lms:course:1', courseId: 1, shortName: 'OS', title: '운영체제', url: 'https://lms.example/course/view.php?id=1' }]);
    const from = new Date(1_799_000_000_000).toISOString(), to = new Date(1_801_000_000_000).toISOString();
    expect((await p.getUpcomingDeadlines({ from, to, limit: 10 }))[0]).toMatchObject({ sourceId: 'lms:due:5', module: 'assign', action: '과제 제출', due: new Date(1_800_000_000_000).toISOString() });
    expect((await p.getAssignments({ from, to, limit: 10 }))[0]).toMatchObject({ sourceId: 'lms:assign:9', submission: 'draft', url: 'https://lms.example/mod/assign/view.php?id=5' });
    expect(calls.every((c) => c.body.includes('wstoken=tok-123'))).toBe(true);
    expect(calls.map((c) => c.fn)).not.toContain(expect.stringMatching(/save|submit|update|delete/));
  });

  it('exchanges id/password for a token and reports a bad login in Korean', async () => {
    const ok = (async () => new Response(JSON.stringify({ token: 'abc' }))) as unknown as typeof fetch;
    expect(await moodleToken('https://lms.example', 'u', 'p', ok)).toBe('abc');
    const bad = (async () => new Response(JSON.stringify({ error: 'x', errorcode: 'invalidlogin' }))) as unknown as typeof fetch;
    await expect(moodleToken('https://lms.example', 'u', 'p', bad)).rejects.toThrow('아이디 또는 비밀번호');
  });
});
