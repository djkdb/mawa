import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from './types.js';
import { LLMProviderError } from './types.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

const DEFAULT_MODEL = 'claude-opus-5-5';

/** Adapter over the official Anthropic SDK (Messages API with tool use and structured output). */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor(options: AnthropicProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.client = new Anthropic({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 16_000,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
              })),
            }
          : {}),
        ...(request.responseFormat
          ? { output_config: { format: { type: 'json_schema' as const, schema: request.responseFormat.schema } } }
          : {}),
      });

      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const toolCalls: LLMToolCall[] = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

      const stopReason =
        response.stop_reason === 'tool_use' ? 'tool_use'
        : response.stop_reason === 'end_turn' ? 'end_turn'
        : response.stop_reason === 'max_tokens' ? 'max_tokens'
        : response.stop_reason === 'refusal' ? 'refusal'
        : 'other';

      return {
        text,
        toolCalls,
        stopReason,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new LLMProviderError(err.message, this.id, true, { cause: err });
      }
      if (err instanceof Anthropic.APIError) {
        throw new LLMProviderError(`${err.status ?? ''} ${err.message}`.trim(), this.id, false, { cause: err });
      }
      throw err;
    }
  }
}

function toAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls ?? []) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      out.push({ role: 'assistant', content });
    } else {
      // Consecutive tool results are merged into one user turn (required for parallel tool use).
      const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}
