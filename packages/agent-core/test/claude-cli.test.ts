import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ClaudeCliProvider } from '../src/index.js';

/**
 * Tests the Claude Code CLI adapter against a stand-in `claude` script that records
 * its argv and stdin and prints a canned `--output-format json` result. It checks the
 * flags the adapter passes (no tools, no session, schema without $schema) and how the
 * structured output is mapped back. It does NOT exercise a real model.
 */
describe('ClaudeCliProvider (fake claude binary)', () => {
  let dir = '';
  const fake = (out: unknown) => `#!/usr/bin/env node
const fs = require('fs');
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify('__DIR__')} + '/call.json', JSON.stringify({ argv: process.argv.slice(2), stdin }));
  process.stdout.write(${JSON.stringify(JSON.stringify(out))});
});
`;
  async function bin(name: string, out: unknown): Promise<string> {
    const p = join(dir, name);
    await writeFile(p, fake(out).replace('__DIR__', dir));
    await chmod(p, 0o755);
    return p;
  }
  const lastCall = async () => JSON.parse(await readFile(join(dir, 'call.json'), 'utf8')) as { argv: string[]; stdin: string };

  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'mawa-fake-claude-')); });

  it('planning turn: sends the tool list and maps toolCalls back', async () => {
    const p = new ClaudeCliProvider({ bin: await bin('plan', { is_error: false, structured_output: { text: 'reading', toolCalls: [{ name: 'lms__get_assignments', input: { days: 14 } }] }, modelUsage: { 'model-x': {} } }) });
    const res = await p.complete({ system: 'SYS', messages: [{ role: 'user', content: '마감 알려줘' }], tools: [{ name: 'lms__get_assignments', description: 'assignments', inputSchema: { type: 'object' } }] });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([expect.objectContaining({ name: 'lms__get_assignments', input: { days: 14 } })]);
    expect(p.model).toBe('model-x');
    const { argv, stdin } = await lastCall();
    expect(argv).toEqual(expect.arrayContaining(['-p', '--no-session-persistence', '--system-prompt', 'SYS']));
    expect(argv[argv.indexOf('--tools') + 1]).toBe('');
    expect(stdin).toContain('lms__get_assignments');
    expect(stdin).toContain('마감 알려줘');
  });

  it('report turn: strips $schema and returns the structured output as JSON text', async () => {
    const p = new ClaudeCliProvider({ bin: await bin('report', { is_error: false, structured_output: { summary: 'ok' } }) });
    const res = await p.complete({ system: 'S', messages: [{ role: 'user', content: 'write' }], responseFormat: { name: 'report', schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' } } });
    expect(JSON.parse(res.text)).toEqual({ summary: 'ok' });
    const { argv } = await lastCall();
    expect(JSON.parse(argv[argv.indexOf('--json-schema') + 1]!)).toEqual({ type: 'object' });
  });

  it('reports CLI errors instead of inventing output', async () => {
    const p = new ClaudeCliProvider({ bin: await bin('err', { is_error: true, result: 'Not logged in' }) });
    await expect(p.complete({ system: 'S', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/Not logged in/);
  });

  it('fails clearly when the binary is missing', async () => {
    const p = new ClaudeCliProvider({ bin: join(dir, 'nope') });
    await expect(p.complete({ system: 'S', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/not available/);
  });
});
