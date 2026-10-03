import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { dirname } from 'node:path';
import { GENESIS, chainOne, parseJsonl, verifyChain, type Chained, type ChainCheck } from '@mawa/shared';

/**
 * An append-only, hash-chained JSONL audit file. Appends are serialized, and on first use the
 * chain continues from the file's last line, so the file stays verifiable across restarts.
 * Without a path the chain is kept in memory only.
 */
export class ChainedAuditLog<T extends object = Record<string, unknown>> {
  private head = GENESIS;
  private seq = 0;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private memory: Array<Chained<T>> = [];

  constructor(readonly path?: string, private readonly signer?: AuditSigner) {}

  /** The signer's public key (base64 SPKI), when lines are signed. */
  get publicKey(): string | undefined { return this.signer?.publicKey; }

  private async resume() {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const text = await readFile(this.path, 'utf8').catch(() => '');
    const last = text.trim().split('\n').filter(Boolean).at(-1);
    if (!last) return;
    const e = JSON.parse(last) as { seq: number; hash: string };
    this.seq = e.seq;
    this.head = e.hash;
  }

  /** Appends entries in order; resolves with the chained lines. */
  append(entries: T[]): Promise<Array<Chained<T>>> {
    const run = this.queue.then(async () => {
      this.ready ??= this.resume();
      await this.ready;
      const out: Array<Chained<T>> = [];
      for (const e of entries) {
        this.seq += 1;
        const c = await chainOne(e, this.seq, this.head);
        this.head = c.hash;
        out.push(this.signer ? { ...c, sig: this.signer.sign(c.hash) } : c);
      }
      if (this.path && out.length) await appendFile(this.path, out.map((c) => `${JSON.stringify(c)}\n`).join(''));
      else this.memory.push(...out);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** All lines (file or memory) and the verification of the whole chain. */
  async read(): Promise<{ entries: Array<Record<string, unknown>>; check: ChainCheck }> {
    await this.queue;
    const entries = this.path ? parseJsonl(await readFile(this.path, 'utf8').catch(() => '')) : (this.memory as unknown as Array<Record<string, unknown>>);
    return { entries, check: await verifyChain(entries, undefined, this.signer?.publicKey) };
  }
}

/** Signs each line's hash with an Ed25519 key, so a rewritten log cannot be re-signed without it. */
export interface AuditSigner { publicKey: string; sign(hash: string): string }

export function signerFromPem(pem: string): AuditSigner {
  const key = createPrivateKey(pem);
  return {
    publicKey: createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64'),
    sign: (hash) => sign(null, Buffer.from(hash, 'utf8'), key).toString('base64'),
  };
}

/** A key that lives only for this process (the demo recordings: nobody can re-sign them later). */
export function ephemeralSigner(): AuditSigner {
  const { privateKey } = generateKeyPairSync('ed25519');
  return signerFromPem(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
}

/** Reads the signing key at `path`, or creates one there (mode 600) on first use. */
export async function loadOrCreateSigner(path: string): Promise<AuditSigner> {
  const pem = await readFile(path, 'utf8').catch(() => null);
  if (pem) return signerFromPem(pem);
  await mkdir(dirname(path), { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  const fresh = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  await writeFile(path, fresh, { mode: 0o600 });
  return signerFromPem(fresh);
}
