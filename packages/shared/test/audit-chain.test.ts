import { describe, expect, it } from 'vitest';
import { GENESIS, chainEntries, parseJsonl, verifyChain } from '../src/index.js';

describe('audit hash chain', () => {
  const rows = [{ action: 'read', tool: 'get_open_issues', rows: 4 }, { action: 'llm', bytes: 1200 }, { action: 'denied', tool: 'get_email' }];

  it('links each entry to the previous hash and verifies', async () => {
    const chain = await chainEntries(rows);
    expect(chain[0]!.prev).toBe(GENESIS);
    expect(chain[1]!.prev).toBe(chain[0]!.hash);
    expect(chain.map((c) => c.seq)).toEqual([1, 2, 3]);
    const res = await verifyChain(chain);
    expect(res).toMatchObject({ ok: true, count: 3, head: chain[2]!.hash });
    // Key order does not matter (canonical JSON).
    const reordered = parseJsonl(chain.map((c) => JSON.stringify(Object.fromEntries(Object.entries(c).reverse()))).join('\n'));
    expect((await verifyChain(reordered)).ok).toBe(true);
  });

  it('detects an edited, removed or reordered line', async () => {
    const chain = await chainEntries(rows);
    expect(await verifyChain([chain[0]!, { ...chain[1]!, bytes: 1 }, chain[2]!])).toMatchObject({ ok: false, brokenAt: 2, reason: expect.stringContaining('바뀌었') });
    expect(await verifyChain([chain[0]!, chain[2]!])).toMatchObject({ ok: false, brokenAt: 2, reason: expect.stringContaining('끊겼') });
    expect(await verifyChain([chain[1]!, chain[0]!, chain[2]!])).toMatchObject({ ok: false, brokenAt: 1 });
  });
});
