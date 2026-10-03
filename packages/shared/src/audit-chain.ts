/**
 * A tamper-evident audit log: every entry carries the hash of the previous one, so changing,
 * removing or reordering any line breaks verification from that line on. SHA-256 via WebCrypto,
 * so the same code runs in Node (the gateway, the verify script) and in the browser.
 */
export const GENESIS = '0'.repeat(64);

export type Chained<T extends object = Record<string, unknown>> = T & { seq: number; prev: string; hash: string };

/** JSON with sorted keys, so the hash does not depend on property order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The hash of one entry: previous hash + the entry (with seq and prev, without its own hash). */
export async function entryHash(entry: Record<string, unknown>): Promise<string> {
  const { hash: _h, ...rest } = entry;
  return sha256Hex(`${String(rest['prev'])}\n${canonical(rest)}`);
}

/** Appends one entry after `prev` (the last hash, or GENESIS). */
export async function chainOne<T extends object>(entry: T, seq: number, prev: string): Promise<Chained<T>> {
  const withLink = { ...entry, seq, prev } as T & { seq: number; prev: string };
  return { ...withLink, hash: await entryHash(withLink as unknown as Record<string, unknown>) };
}

export async function chainEntries<T extends object>(entries: T[], prev = GENESIS, startSeq = 1): Promise<Array<Chained<T>>> {
  const out: Array<Chained<T>> = [];
  let p = prev;
  for (const [i, e] of entries.entries()) {
    const c = await chainOne(e, startSeq + i, p);
    out.push(c);
    p = c.hash;
  }
  return out;
}

export type ChainCheck = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; reason: string };

/**
 * Checks every link; reports the first line (1-based) whose hash or back-link does not match.
 * `start` is the hash the first line must link to: GENESIS for a whole log, or the `prev` of the
 * first line when checking a tail (then everything before it is outside the check).
 */
export async function verifyChain(entries: Array<Record<string, unknown>>, start = GENESIS): Promise<ChainCheck> {
  let prev = start;
  for (const [i, e] of entries.entries()) {
    if (e['prev'] !== prev) return { ok: false, count: entries.length, brokenAt: i + 1, reason: i === 0 ? '첫 줄이 체인의 시작이 아닙니다' : '이전 줄과 연결이 끊겼습니다 (삭제·순서 변경)' };
    if (e['hash'] !== (await entryHash(e))) return { ok: false, count: entries.length, brokenAt: i + 1, reason: '내용이 기록 이후 바뀌었습니다' };
    prev = String(e['hash']);
  }
  return { ok: true, count: entries.length, head: prev };
}

export function parseJsonl(text: string): Array<Record<string, unknown>> {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}
