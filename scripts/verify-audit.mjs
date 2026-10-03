#!/usr/bin/env node
/**
 * Verifies a hash-chained audit log (JSONL): the web audit export or the gateway's audit file.
 *   npm run audit:verify -- path/to/audit.jsonl [--public-key=<base64 SPKI>]
 * With a public key, every line's Ed25519 signature is checked too.
 * Exit 0 when every line matches, 1 with the first broken line otherwise.
 */
import { readFile } from 'node:fs/promises';
import { parseJsonl, verifyChain } from '@mawa/shared';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const publicKey = process.argv.find((a) => a.startsWith('--public-key='))?.slice(13);
if (!file) { console.error('usage: npm run audit:verify -- <file.jsonl>'); process.exit(2); }
const res = await verifyChain(parseJsonl(await readFile(file, 'utf8')), undefined, publicKey);
if (res.ok) console.log(`OK · ${res.count} lines · head ${res.head} · signature ${res.signature}`);
else { console.error(`BROKEN at line ${res.brokenAt}/${res.count}: ${res.reason}`); process.exit(1); }
