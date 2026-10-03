import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse } from './types.js';
import { LLMProviderError } from './types.js';

export interface ClaudeCliOptions {
  /** Path to the `claude` binary (default: `claude` on PATH). */
  bin?: string;
  /** Model alias or id passed as --model (default: the CLI's default model). */
  model?: string;
  timeoutMs?: number;
}

/**
 * How to start the CLI. On Windows, Node's spawn finds neither `claude.cmd` nor `claude.ps1`
 * (npm shims) without a shell, and going through cmd.exe would mangle the JSON arguments. So the
 * shim is read for the file it launches: a .js is run with this Node, an .exe is spawned directly.
 */
export function resolveClaudeCommand(bin: string | undefined, platform = process.platform, env = process.env, where = whereClaude): { command: string; prefix: string[] } {
  const explicit = bin ?? env['CLAUDE_BIN'];
  if (platform !== 'win32') return { command: explicit ?? 'claude', prefix: [] };
  const candidates = explicit ? [explicit] : [...where(env), ...searchDirs(env).flatMap((d) => ['claude.exe', 'claude.cmd'].map((f) => join(d, f)))];
  for (const c of candidates) {
    const r = fromCandidate(c);
    if (r) return r;
  }
  return { command: explicit ?? 'claude', prefix: [] };
}

function searchDirs(env: NodeJS.ProcessEnv): string[] {
  return [...(env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter(Boolean), join(homedir(), '.local', 'bin'), ...(env['APPDATA'] ? [join(env['APPDATA'], 'npm')] : [])];
}

function whereClaude(env: NodeJS.ProcessEnv): string[] {
  try {
    return execFileSync('where.exe', ['claude'], { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function fromCandidate(file: string): { command: string; prefix: string[] } | undefined {
  if (!existsSync(file)) return undefined;
  const lower = file.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return { command: process.execPath, prefix: [file] };
  if (lower.endsWith('.exe')) return { command: file, prefix: [] };
  // npm shims (.cmd / .ps1 / extensionless sh): the target is written relative to the shim's folder.
  let text: string;
  try { text = readFileSync(lower.endsWith('.cmd') || lower.endsWith('.ps1') ? file : `${file}.cmd`, 'utf8'); } catch { return undefined; }
  const m = /(?:%~?dp0%?|\$basedir)[\\/]+([^"'\s]+\.(?:exe|js|mjs|cjs))/i.exec(text);
  if (!m) return undefined;
  const target = join(dirname(file), ...m[1]!.split(/[\\/]+/));
  return existsSync(target) ? fromCandidate(target) : undefined;
}

/** What the model returns on a planning turn: which tools to call next, or none when it has enough. */
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One short sentence: what you will do next, or that you have enough data.' },
    toolCalls: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, input: { type: 'object' } }, required: ['name', 'input'] },
    },
  },
  required: ['text', 'toolCalls'],
} as const;

function transcript(messages: LLMMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === 'user') return `USER:\n${m.content}`;
      if (m.role === 'assistant') return `ASSISTANT:\n${m.content}${m.toolCalls?.length ? `\n(called: ${m.toolCalls.map((t) => `${t.name} ${JSON.stringify(t.input)}`).join('; ')})` : ''}`;
      return `TOOL RESULT (${m.toolCallId})${m.isError ? ' [error]' : ''}:\n${m.content}`;
    })
    .join('\n\n');
}

/**
 * Uses the Claude Code CLI in headless mode (`claude -p`) as the LLM — no API key in this app;
 * the CLI's own login is used. Each request is one tool-less CLI call with a JSON schema:
 * on planning turns the model returns the tool calls it wants (the agent executes them over MCP),
 * on the analysis turn it returns the report JSON. The CLI gets no tools of its own (--tools ""),
 * runs in an empty temp directory and keeps no session.
 */
export class ClaudeCliProvider implements LLMProvider {
  readonly id = 'claude-cli';
  model: string;
  private cwd: Promise<string> | null = null;

  constructor(private readonly options: ClaudeCliOptions = {}) {
    this.model = options.model ?? 'claude-cli-default';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const planning = !request.responseFormat && Boolean(request.tools?.length);
    const raw = request.responseFormat?.schema ?? (planning ? PLAN_SCHEMA : { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] });
    // The CLI validates the schema with draft-07 tooling; drop the draft marker zod adds.
    const { $schema: _draft, ...schema } = raw as Record<string, unknown>;
    const tools = planning
      ? `\n\nAVAILABLE TOOLS (call them by returning toolCalls; the agent runs them over MCP and shows you the results):\n${request.tools!.map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.inputSchema)}`).join('\n')}\n\nReturn toolCalls: [] when you have enough data.`
      : '';
    const prompt = `${transcript(request.messages)}${tools}\n\nAnswer only with JSON matching the schema.`;
    const out = await this.run(prompt, request.system, schema);
    const j = out as { structured_output?: unknown; result?: string; is_error?: boolean; modelUsage?: Record<string, unknown>; stop_reason?: string };
    if (j.is_error) throw new LLMProviderError(`claude CLI error: ${String(j.result ?? '').slice(0, 300)}`, this.id, false);
    const used = Object.keys(j.modelUsage ?? {})[0];
    if (used) this.model = used;
    const data = (j.structured_output ?? (() => { try { return JSON.parse(j.result ?? ''); } catch { return null; } })()) as Record<string, unknown> | null;
    if (!data) throw new LLMProviderError('claude CLI returned no structured output', this.id, false);
    if (request.responseFormat) return { text: JSON.stringify(data), toolCalls: [], stopReason: 'end_turn' };
    const calls = Array.isArray(data['toolCalls']) ? (data['toolCalls'] as Array<{ name?: unknown; input?: unknown }>) : [];
    const toolCalls = calls
      .filter((c) => typeof c.name === 'string')
      .map((c, i) => ({ id: `cli_call_${Date.now().toString(36)}_${i}`, name: c.name as string, input: c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {} }));
    return { text: typeof data['text'] === 'string' ? data['text'] : '', toolCalls, stopReason: toolCalls.length ? 'tool_use' : 'end_turn' };
  }

  private async run(prompt: string, system: string, schema: unknown): Promise<unknown> {
    this.cwd ??= mkdtemp(join(tmpdir(), 'mawa-claude-cli-'));
    const cwd = await this.cwd;
    const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--system-prompt', system, '--json-schema', JSON.stringify(schema), ...(this.options.model ? ['--model', this.options.model] : [])];
    return new Promise((resolve, reject) => {
      const { command, prefix } = resolveClaudeCommand(this.options.bin);
      const child = spawn(command, [...prefix, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new LLMProviderError('claude CLI timed out', this.id, true)); }, this.options.timeoutMs ?? 240_000);
      child.stdout.on('data', (d) => { stdout += String(d); });
      child.stderr.on('data', (d) => { stderr += String(d); });
      child.on('error', (err) => { clearTimeout(timer); reject(new LLMProviderError(`claude CLI not available (${command}): ${err.message}. Install and log in to Claude Code (claude --version), or set CLAUDE_BIN to its path.`, this.id, false, { cause: err })); });
      child.on('close', (code) => {
        clearTimeout(timer);
        try { resolve(JSON.parse(stdout)); } catch { reject(new LLMProviderError(`claude CLI exited ${code}: ${(stderr || stdout).slice(0, 300)}`, this.id, false)); }
      });
      child.stdin.end(prompt);
    });
  }
}
