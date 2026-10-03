import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MemoryRunStore, type RunRecord } from '@mawa/agent-core';
import { parseKey } from '../auth/token-store.js';

/**
 * Run history that survives restarts, so "지난 실행 대비" can compare with last week.
 * Finished runs are written AES-256-GCM encrypted with SESSION_ENCRYPTION_KEY (they contain
 * mail and calendar data). Raw JSON-RPC message events are not kept on disk; the rest of
 * the trace (tool calls, LLM request summaries, report) is.
 */
export class EncryptedRunStore extends MemoryRunStore {
  private key: Buffer;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string, keyHex: string, private readonly keep = 30) {
    super(keep);
    this.key = parseKey(keyHex);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as { iv: string; tag: string; data: string };
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(raw.iv, 'base64'));
      d.setAuthTag(Buffer.from(raw.tag, 'base64'));
      const runs = JSON.parse(Buffer.concat([d.update(Buffer.from(raw.data, 'base64')), d.final()]).toString('utf8')) as RunRecord[];
      for (const r of runs) await super.create(r);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[run-store] could not read history, starting empty:', (err as Error).message);
    }
  }

  override async update(runId: string, patch: Partial<RunRecord>): Promise<void> {
    await super.update(runId, patch);
    if (patch.status && patch.status !== 'running') await this.persist();
  }

  private persist(): Promise<void> {
    this.writing = this.writing.then(async () => {
      const finished = (await this.list(this.keep)).filter((r) => r.status !== 'running').reverse()
        .map((r) => ({ ...r, events: r.events.filter((e) => e.type !== 'mcp_message') }));
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', this.key, iv);
      const data = Buffer.concat([c.update(JSON.stringify(finished), 'utf8'), c.final()]);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify({ iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
    }).catch((err: unknown) => console.error('[run-store] write failed:', (err as Error).message));
    return this.writing;
  }
}
