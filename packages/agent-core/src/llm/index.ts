import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider, OpenAIProvider } from './openai.js';
import { ScriptedProvider } from './scripted.js';
import type { LLMProvider } from './types.js';

export * from './types.js';
export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider, OpenAICompatibleProvider } from './openai.js';
export { ScriptedProvider } from './scripted.js';

export type LLMProviderId = 'anthropic' | 'openai' | 'openai-compatible' | 'scripted';

export interface LLMConfig {
  provider: LLMProviderId;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/** Reads LLM_PROVIDER / LLM_API_KEY / LLM_MODEL / LLM_BASE_URL. Falls back to scripted when no key is configured. */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  const requested = (env['LLM_PROVIDER'] ?? 'anthropic') as LLMProviderId;
  const apiKey = env['LLM_API_KEY'] || undefined;
  const model = env['LLM_MODEL'] || undefined;
  const baseURL = env['LLM_BASE_URL'] || undefined;
  if (!['anthropic', 'openai', 'openai-compatible', 'scripted'].includes(requested)) {
    throw new Error(`Unknown LLM_PROVIDER "${requested}"`);
  }
  const provider: LLMProviderId = requested !== 'scripted' && !apiKey && requested !== 'openai-compatible' ? 'scripted' : requested;
  return { provider, ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}), ...(baseURL ? { baseURL } : {}) };
}

export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider({ ...(config.apiKey ? { apiKey: config.apiKey } : {}), ...(config.model ? { model: config.model } : {}), ...(config.baseURL ? { baseURL: config.baseURL } : {}) });
    case 'openai':
      return new OpenAIProvider({ ...(config.apiKey ? { apiKey: config.apiKey } : {}), ...(config.model ? { model: config.model } : {}) });
    case 'openai-compatible':
      if (!config.baseURL) throw new Error('LLM_BASE_URL is required for openai-compatible');
      return new OpenAICompatibleProvider({ baseURL: config.baseURL, apiKey: config.apiKey ?? 'not-needed', ...(config.model ? { model: config.model } : {}) });
    case 'scripted':
      return new ScriptedProvider();
  }
}
