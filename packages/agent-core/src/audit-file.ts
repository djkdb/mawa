import { appendFile, mkdir, readFile } from 'node:fs/promises';
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

  constructor(readonly path?: string) {}

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
        out.push(c);
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
    return { entries, check: await verifyChain(entries) };
  }
}
