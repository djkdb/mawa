import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { llmConfigFromEnv, type LLMConfig } from '@mawa/agent-core';
import { AgentModeSchema, type AgentMode } from '@mawa/shared';

/** Load ../../.env (repo root) if present. Secrets never leave process.env. */
export function loadDotenv(): void {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
  const file = resolve(root, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

const EnvSchema = z.object({
  AGENT_MODE: AgentModeSchema.default('demo'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  /** Interface to bind. Loopback by default: run records contain mail and calendar data. */
  API_HOST: z.string().default('127.0.0.1'),
  /** Optional shared secret. When set, /api/* and disconnect require it (Bearer header, or access_token query for SSE). */
  API_ACCESS_TOKEN: z.string().min(16).optional(),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_ENCRYPTION_KEY: z.string().optional(),
  TOKEN_STORE_PATH: z.string().optional(),
  RUN_STORE_PATH: z.string().optional(),
  LMS_BASE_URL: z.string().default('https://lms.chungbuk.ac.kr'),
});

export interface AppConfig {
  defaultMode: AgentMode;
  port: number;
  host: string;
  accessToken?: string;
  webOrigin: string;
  publicUrl: string;
  llm: LLMConfig;
  github: { clientId?: string; clientSecret?: string };
  google: { clientId?: string; clientSecret?: string };
  lms: { baseUrl: string };
  encryptionKey?: string;
  tokenStorePath: string;
  runStorePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = EnvSchema.parse(env);
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
  return {
    defaultMode: e.AGENT_MODE,
    port: e.API_PORT,
    host: e.API_HOST,
    ...(e.API_ACCESS_TOKEN ? { accessToken: e.API_ACCESS_TOKEN } : {}),
    webOrigin: e.WEB_ORIGIN,
    publicUrl: e.API_PUBLIC_URL ?? `http://localhost:${e.API_PORT}`,
    llm: llmConfigFromEnv(env),
    github: { ...(e.GITHUB_CLIENT_ID ? { clientId: e.GITHUB_CLIENT_ID } : {}), ...(e.GITHUB_CLIENT_SECRET ? { clientSecret: e.GITHUB_CLIENT_SECRET } : {}) },
    lms: { baseUrl: e.LMS_BASE_URL },
    google: { ...(e.GOOGLE_CLIENT_ID ? { clientId: e.GOOGLE_CLIENT_ID } : {}), ...(e.GOOGLE_CLIENT_SECRET ? { clientSecret: e.GOOGLE_CLIENT_SECRET } : {}) },
    ...(e.SESSION_ENCRYPTION_KEY ? { encryptionKey: e.SESSION_ENCRYPTION_KEY } : {}),
    tokenStorePath: e.TOKEN_STORE_PATH ?? resolve(root, '.tokens', 'tokens.enc.json'),
    runStorePath: e.RUN_STORE_PATH ?? resolve(root, '.tokens', 'runs.enc.json'),
  };
}
