#!/usr/bin/env node
/**
 * TEST ONLY. Stands in for `claude -p --output-format json` so the web e2e exercises the API's
 * claude-cli provider (process spawn, CLAUDE_BIN resolution, JSON-schema turns) without a login.
 * Planning turn: calls every GitHub tool once, then stops. Analysis turn: one item per source,
 * citing it, text prefixed with [가짜 모델] so nobody mistakes it for a real model's output.
 */
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const schema = process.argv[process.argv.indexOf('--json-schema') + 1] ?? '';
  const out = (structured_output) => process.stdout.write(JSON.stringify({ is_error: false, structured_output, modelUsage: { 'fake-claude-e2e': {} } }));
  // A prompt containing [e2e-fail] simulates an expired Claude Code login.
  if (stdin.includes('[e2e-fail]')) return process.stdout.write(JSON.stringify({ is_error: true, result: 'Failed to authenticate: OAuth session expired (fake)' }));
  if (schema.includes('"sections"')) {
    const sources = [...stdin.matchAll(/"id":"((?:github|gmail|calendar|lms):[^"]+)","type":"[^"]+","title":"((?:[^"\\]|\\.)*)"/g)].map((m) => ({ id: m[1], title: JSON.parse(`"${m[2]}"`) }));
    const items = sources.map((s) => ({ text: `[가짜 모델] ${s.title}`, confidence: 'observed', sources: [s.id] }));
    return out({ sections: [
      { id: 'overview', items: items.slice(0, 1).length ? [{ text: `[가짜 모델] 출처 ${sources.length}건을 읽었습니다.`, confidence: 'observed', sources: sources.slice(0, 1).map((s) => s.id) }] : [] },
      { id: 'project_progress', items },
    ] });
  }
  if (stdin.includes('TOOL RESULT')) return out({ text: '충분합니다.', toolCalls: [] });
  const tools = [...new Set([...stdin.matchAll(/^- (github__[a-z_]+):/gm)].map((m) => m[1]))];
  out({ text: 'GitHub를 읽겠습니다.', toolCalls: tools.map((name) => ({ name, input: {} })) });
});
