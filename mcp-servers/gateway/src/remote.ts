import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ChainedAuditLog, type ToolExecutor } from '@mawa/agent-core';
import { DataPolicySchema, tightenPolicy, type DataPolicy } from '@mawa/shared';
import { createGateway, type AuditEntry } from './gateway.js';

/** One user of the remote gateway: a name, the SHA-256 of their token (never the token), and an optional stricter policy. */
export interface GatewayUser { user: string; tokenSha256: string; policy?: Partial<DataPolicy> }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A new random token and its users-file entry. The token is shown once; only the hash is stored. */
export function newUserToken(user: string): { token: string; entry: GatewayUser } {
  const token = `mgw_${randomBytes(24).toString('base64url')}`;
  return { token, entry: { user, tokenSha256: sha256(token) } };
}

export async function loadUsers(path: string): Promise<GatewayUser[]> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as { users?: GatewayUser[] };
  return (raw.users ?? []).filter((u) => typeof u.user === 'string' && /^[0-9a-f]{64}$/.test(u.tokenSha256));
}

function who(req: IncomingMessage, users: GatewayUser[]): GatewayUser | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  if (!m) return null;
  const h = Buffer.from(sha256(m[1]!), 'hex');
  return users.find((u) => { const b = Buffer.from(u.tokenSha256, 'hex'); return b.length === h.length && timingSafeEqual(b, h); }) ?? null;
}

export interface RemoteOptions {
  executor: ToolExecutor;
  policy: Partial<DataPolicy>;
  users: GatewayUser[];
  mode: 'demo' | 'real';
  auditPath?: string;
}

/**
 * The gateway over Streamable HTTP: every request needs a Bearer token that maps to a user, each MCP
 * session is bound to that user, the user's policy can only tighten the gateway's, and every audit
 * line names the user. One audit chain for all sessions.
 */
export function createRemoteGateway(options: RemoteOptions): { http: HttpServer; audit: ChainedAuditLog<AuditEntry> } {
  const base = DataPolicySchema.parse(options.policy);
  const audit = new ChainedAuditLog<AuditEntry>(options.auditPath);
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; user: string }>();

  const http = createServer(async (req, res) => {
    const deny = (code: number, message: string) => { res.writeHead(code, { 'content-type': 'application/json', ...(code === 401 ? { 'www-authenticate': 'Bearer' } : {}) }).end(JSON.stringify({ error: message })); };
    if (!req.url?.startsWith('/mcp')) return deny(404, 'not found');
    const user = who(req, options.users);
    if (!user) {
      await audit.append([{ at: new Date().toISOString(), client: String(req.headers['user-agent'] ?? 'unknown'), mode: options.mode, action: 'denied', detail: 'missing or unknown token' }]);
      return deny(401, 'A valid Bearer token is required.');
    }
    const sid = req.headers['mcp-session-id'];
    const existing = typeof sid === 'string' ? sessions.get(sid) : undefined;
    if (existing && existing.user !== user.user) return deny(403, 'This session belongs to another user.');

    let body: unknown;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { return deny(400, 'invalid JSON'); }
    }
    if (existing) return existing.transport.handleRequest(req, res, body);
    if (req.method !== 'POST' || !isInitializeRequest(body)) return deny(400, 'Start with an initialize request.');

    const { policy, refused } = tightenPolicy(base, user.policy);
    if (refused.length) return deny(403, `The user policy may only tighten the gateway policy (${refused.join(', ')}).`);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { sessions.set(id, { transport, user: user.user }); } });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    const { server } = createGateway({ executor: options.executor, policy, mode: options.mode, audit, user: user.user });
    // The SDK's transport types its optional callbacks loosely for exactOptionalPropertyTypes.
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    return transport.handleRequest(req, res, body);
  });
  return { http, audit };
}
