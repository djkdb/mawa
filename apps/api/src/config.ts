import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { llmConfigFromEnv, type LLMConfig } from '@mawa/agent-core';
import { githubScopesFromEnv } from './auth/scopes.js';
import { AgentModeSchema, DataPolicySchema, type AgentMode, type DataPolicy } from '@mawa/shared';

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
  /** Test-only overrides (a local fake GitHub). Must be https, or http on localhost. */
  GITHUB_OAUTH_URL: z.string().optional(),
  GITHUB_API_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_ENCRYPTION_KEY: z.string().optional(),
  TOKEN_STORE_PATH: z.string().optional(),
  RUN_STORE_PATH: z.string().optional(),
  LMS_BASE_URL: z.string().default('https://lms.chungbuk.ac.kr'),
  /** Hash-chained audit log (JSONL). Default: .tokens/audit.jsonl (git-ignored). */
  AUDIT_LOG_PATH: z.string().optional(),
  /** Ed25519 key that signs audit lines (PEM). Created on first start. Default: .tokens/audit-signing-key.pem. */
  AUDIT_SIGNING_KEY_PATH: z.string().optional(),
  /** Server-owned data policy (JSON). Requests can only make it stricter. */
  POLICY_PATH: z.string().optional(),
});

export interface AppConfig {
  defaultMode: AgentMode;
  port: number;
  host: string;
  accessToken?: string;
  webOrigin: string;
  publicUrl: string;
  llm: LLMConfig;
  github: { clientId?: string; clientSecret?: string; oauthUrl: string; apiUrl: string; /** [] for a GitHub App (permissions come from the app). */ scopes: string[] };
  google: { clientId?: string; clientSecret?: string };
  lms: { baseUrl: string };
  encryptionKey?: string;
  tokenStorePath: string;
  runStorePath: string;
  auditLogPath: string;
  auditSigningKeyPath: string;
  /** The base policy every run starts from, and where it came from. */
  policy: { base: DataPolicy; source: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // `KEY=` copied from .env.example means "not set", not an empty path or URL.
  // GITHUB_OAUTH_SCOPES is the exception: empty is meaningful (a GitHub App asks for no scope).
  const e = EnvSchema.parse(Object.fromEntries(Object.entries(env).filter(([k, v]) => k === 'GITHUB_OAUTH_SCOPES' || (v ?? '').trim() !== '')));
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
  return {
    defaultMode: e.AGENT_MODE,
    port: e.API_PORT,
    host: e.API_HOST,
    ...(e.API_ACCESS_TOKEN ? { accessToken: e.API_ACCESS_TOKEN } : {}),
    webOrigin: e.WEB_ORIGIN,
    publicUrl: e.API_PUBLIC_URL ?? `http://localhost:${e.API_PORT}`,
    llm: llmConfigFromEnv(env),
    github: {
      ...(e.GITHUB_CLIENT_ID ? { clientId: e.GITHUB_CLIENT_ID } : {}),
      ...(e.GITHUB_CLIENT_SECRET ? { clientSecret: e.GITHUB_CLIENT_SECRET } : {}),
      oauthUrl: safeBaseUrl(e.GITHUB_OAUTH_URL, 'https://github.com', 'GITHUB_OAUTH_URL'),
      apiUrl: safeBaseUrl(e.GITHUB_API_URL, 'https://api.github.com', 'GITHUB_API_URL'),
      scopes: githubScopesFromEnv(env),
    },
    lms: { baseUrl: e.LMS_BASE_URL },
    google: { ...(e.GOOGLE_CLIENT_ID ? { clientId: e.GOOGLE_CLIENT_ID } : {}), ...(e.GOOGLE_CLIENT_SECRET ? { clientSecret: e.GOOGLE_CLIENT_SECRET } : {}) },
    ...(e.SESSION_ENCRYPTION_KEY ? { encryptionKey: e.SESSION_ENCRYPTION_KEY } : {}),
    tokenStorePath: e.TOKEN_STORE_PATH ?? resolve(root, '.tokens', 'tokens.enc.json'),
    runStorePath: e.RUN_STORE_PATH ?? resolve(root, '.tokens', 'runs.enc.json'),
    auditLogPath: e.AUDIT_LOG_PATH ?? resolve(root, '.tokens', 'audit.jsonl'),
    auditSigningKeyPath: e.AUDIT_SIGNING_KEY_PATH ?? (e.AUDIT_LOG_PATH ? `${e.AUDIT_LOG_PATH}.key.pem` : resolve(root, '.tokens', 'audit-signing-key.pem')),
    policy: loadPolicy(e.POLICY_PATH),
  };
}

/** Tokens are sent to these hosts, so an override must be https, or plain http only on this machine. */
export function safeBaseUrl(raw: string | undefined, fallback: string, name: string): string {
  if (!raw) return fallback;
  const u = new URL(raw);
  const local = u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error(`${name} must be https:// (or http://localhost for tests)`);
  return u.origin;
}

/** The server's base policy: POLICY_PATH if given (validated), else masking on, nothing excluded. */
function loadPolicy(path: string | undefined): { base: DataPolicy; source: string } {
  if (!path) return { base: DataPolicySchema.parse({}), source: 'default' };
  return { base: DataPolicySchema.parse(JSON.parse(readFileSync(path, 'utf8'))), source: path };
}
