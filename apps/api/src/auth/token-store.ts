import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type OAuthProviderId = 'github' | 'google' | 'lms';

export interface StoredToken {
  provider: OAuthProviderId;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  scope?: string;
  account?: string;
  connectedAt: string;
}

/**
 * Single-user token store (this is a personal agent). Tokens are encrypted
 * at rest with AES-256-GCM using SESSION_ENCRYPTION_KEY. Without a key the
 * store is memory-only and tokens vanish on restart; /api/status says so.
 */
export class TokenStore {
  private tokens = new Map<OAuthProviderId, StoredToken>();
  private key: Buffer | null;

  constructor(private readonly path: string, encryptionKeyHex?: string) {
    this.key = encryptionKeyHex ? parseKey(encryptionKeyHex) : null;
  }

  get persistent(): boolean {
    return this.key !== null;
  }

  async load(): Promise<void> {
    if (!this.key) return;
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as { iv: string; tag: string; data: string };
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(raw.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
      const json = Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]).toString('utf8');
      for (const t of JSON.parse(json) as StoredToken[]) this.tokens.set(t.provider, t);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[token-store] could not read store, starting empty:', (err as Error).message);
    }
  }

  private async persist(): Promise<void> {
    if (!this.key) return;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify([...this.tokens.values()]), 'utf8'), cipher.final()]);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
  }

  get(provider: OAuthProviderId): StoredToken | null {
    return this.tokens.get(provider) ?? null;
  }

  async set(token: StoredToken): Promise<void> {
    this.tokens.set(token.provider, token);
    await this.persist();
  }

  async remove(provider: OAuthProviderId): Promise<void> {
    this.tokens.delete(provider);
    await this.persist();
  }
}

export function parseKey(hex: string): Buffer {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('SESSION_ENCRYPTION_KEY must be 32 bytes as 64 hex characters (openssl rand -hex 32)');
  return buf;
}
