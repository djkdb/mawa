import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/index.js';

/**
 * Wire-level test of the Anthropic adapter against a local stand-in for the
 * Messages API. It verifies the request the adapter sends (tools with
 * input_schema, output_config.format for structured output, tool_result
 * blocks merged into one user turn) and how responses are mapped back.
 * It does NOT exercise a real model; that needs LLM_API_KEY.
 */
describe('AnthropicProvider request/response mapping (mock server)', () => {
  let server: Server;
  let baseURL = '';
  const requests: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        requests.push(parsed);
        const hasToolResult = (parsed['messages'] as Array<{ content: unknown }>).some((m) => Array.isArray(m.content) && (m.content as Array<{ type: string }>)[0]?.type === 'tool_result');
        const content = parsed['output_config']
          ? [{ type: 'text', text: '{"sections":[]}' }]
          : hasToolResult
            ? [{ type: 'text', text: 'done' }]
            : [{ type: 'tool_use', id: 'toolu_1', name: 'github__get_recent_commits', input: { limit: 5 } }];
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'mock', content, stop_reason: parsed['output_config'] || hasToolResult ? 'end_turn' : 'tool_use', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address() as { port: number };
    baseURL = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('sends tools as input_schema and maps tool_use back to toolCalls', async () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', baseURL, model: 'mock-model' });
    const res = await provider.complete({ system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'github__get_recent_commits', description: 'd', inputSchema: { type: 'object', properties: {} } }] });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ id: 'toolu_1', name: 'github__get_recent_commits', input: { limit: 5 } }]);
    const sent = requests.at(-1)!;
    expect(sent['model']).toBe('mock-model');
    expect(sent['system']).toBe('sys');
    expect((sent['tools'] as Array<{ name: string; input_schema: unknown }>)[0]).toMatchObject({ name: 'github__get_recent_commits', input_schema: { type: 'object' } });
  });

  it('merges consecutive tool results into one user turn with tool_result blocks', async () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', baseURL });
    const res = await provider.complete({
      system: 'sys',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't1', input: {} }, { id: 'b', name: 't2', input: {} }] },
        { role: 'tool', toolCallId: 'a', content: 'r1' },
        { role: 'tool', toolCallId: 'b', content: 'r2', isError: true },
      ],
    });
    expect(res.stopReason).toBe('end_turn');
    const msgs = requests.at(-1)!['messages'] as Array<{ role: string; content: unknown }>;
    expect(msgs).toHaveLength(3);
    expect(msgs[1]).toMatchObject({ role: 'assistant' });
    expect(msgs[2]!.role).toBe('user');
    expect(msgs[2]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'r1' },
      { type: 'tool_result', tool_use_id: 'b', content: 'r2', is_error: true },
    ]);
  });

  it('requests structured output through output_config.format json_schema', async () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', baseURL });
    const res = await provider.complete({ system: 's', messages: [{ role: 'user', content: 'report' }], responseFormat: { name: 'r', schema: { type: 'object' } } });
    expect(res.text).toBe('{"sections":[]}');
    expect(requests.at(-1)!['output_config']).toEqual({ format: { type: 'json_schema', schema: { type: 'object' } } });
  });
});
