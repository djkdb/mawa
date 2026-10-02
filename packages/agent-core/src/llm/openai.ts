import OpenAI from 'openai';
import type { LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from './types.js';
import { LLMProviderError } from './types.js';

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  /** Any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, OpenRouter, ...). */
  baseURL?: string;
  id?: 'openai' | 'openai-compatible';
}

/**
 * Adapter over the OpenAI SDK (Chat Completions with tool calling and
 * JSON-schema response format). `OpenAICompatibleProvider` is the same
 * adapter pointed at a custom base URL.
 */
export class OpenAIProvider implements LLMProvider {
  readonly id: string;
  readonly model: string;
  private client: OpenAI;

  constructor(options: OpenAIProviderOptions = {}) {
    this.id = options.id ?? 'openai';
    this.model = options.model ?? 'gpt-4.1';
    this.client = new OpenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: request.maxTokens ?? 16_000,
        messages: [{ role: 'system', content: request.system }, ...toOpenAIMessages(request.messages)],
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                type: 'function' as const,
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              })),
            }
          : {}),
        ...(request.responseFormat
          ? { response_format: { type: 'json_schema' as const, json_schema: { name: request.responseFormat.name, schema: request.responseFormat.schema } } }
          : {}),
      });

      const choice = completion.choices[0];
      const msg = choice?.message;
      const toolCalls: LLMToolCall[] = (msg?.tool_calls ?? []).flatMap((tc) => {
        if (tc.type !== 'function') return [];
        return [{ id: tc.id, name: tc.function.name, input: safeParseArgs(tc.function.arguments) }];
      });
      const finish = choice?.finish_reason;
      const stopReason =
        finish === 'tool_calls' ? 'tool_use'
        : finish === 'stop' ? 'end_turn'
        : finish === 'length' ? 'max_tokens'
        : finish === 'content_filter' ? 'refusal'
        : 'other';
      return {
        text: msg?.content ?? '',
        toolCalls,
        stopReason,
        ...(completion.usage ? { usage: { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } } : {}),
      };
    } catch (err) {
      if (err instanceof OpenAI.RateLimitError || err instanceof OpenAI.InternalServerError || err instanceof OpenAI.APIConnectionError) {
        throw new LLMProviderError(err.message, this.id, true, { cause: err });
      }
      if (err instanceof OpenAI.APIError) {
        throw new LLMProviderError(`${err.status ?? ''} ${err.message}`.trim(), this.id, false, { cause: err });
      }
      throw err;
    }
  }
}

export class OpenAICompatibleProvider extends OpenAIProvider {
  constructor(options: Omit<OpenAIProviderOptions, 'id'> & { baseURL: string }) {
    super({ ...options, id: 'openai-compatible' });
  }
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.ChatCompletionMessageParam => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
          : {}),
      };
    }
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  });
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
