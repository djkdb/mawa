/**
 * Provider-agnostic LLM contract. agent-core only ever talks to this
 * interface; vendor SDKs live behind adapters in ./anthropic.ts, ./openai.ts.
 */
export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LLMMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LLMToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string; isError?: boolean };

export interface LLMResponseFormat {
  name: string;
  /** JSON Schema the model must conform to. */
  schema: Record<string, unknown>;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  responseFormat?: LLMResponseFormat;
  maxTokens?: number;
}

export type LLMStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface LLMResponse {
  text: string;
  toolCalls: LLMToolCall[];
  stopReason: LLMStopReason;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  /** e.g. "anthropic", "openai", "openai-compatible", "scripted" */
  readonly id: string;
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LLMProviderError';
  }
}
