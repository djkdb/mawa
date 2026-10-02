import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { rebaseDates } from '../rebase-dates.js';
import { EmailSchema, type Email, type EmailSummary, type GmailProvider } from '../types.js';

const FixtureSchema = z.object({ emails: z.array(EmailSchema) });

/** Demo provider: a small synthetic mailbox; query matching is a case-insensitive keyword OR over subject/from/snippet/body. */
export class DemoGmailProvider implements GmailProvider {
  private emails: Promise<Email[]>;

  constructor(fixturePath = fileURLToPath(new URL('../../fixtures/gmail.json', import.meta.url))) {
    this.emails = readFile(fixturePath, 'utf8').then((raw) => FixtureSchema.parse(rebaseDates(JSON.parse(raw))).emails);
  }

  async searchEmails({ query, since, limit }: { query: string; since?: string; limit: number }): Promise<EmailSummary[]> {
    const emails = await this.emails;
    // Honour Gmail's `-category:x` exclusions by label, like the real API does.
    const excludedLabels = [...query.matchAll(/-category:(\w+)/g)].map((m) => `CATEGORY_${m[1]!.toUpperCase()}`);
    const words = query
      .replace(/-?(category|label|after|before|from|to):\S+/g, ' ')
      .replace(/[()"]/g, ' ')
      .split(/\s+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w && w !== 'or' && w !== 'and');
    return emails
      .filter((e) => !since || e.date >= since)
      .filter((e) => !e.labels.some((l) => excludedLabels.includes(l)))
      .filter((e) => words.length === 0 || words.some((w) => `${e.subject} ${e.from} ${e.snippet} ${e.body}`.toLowerCase().includes(w)))
      .slice(0, limit)
      .map(({ body: _body, truncated: _t, ...summary }) => summary);
  }

  async getEmail({ messageId, bodyMaxChars }: { messageId: string; bodyMaxChars: number }): Promise<Email | null> {
    const email = (await this.emails).find((e) => e.messageId === messageId);
    if (!email) return null;
    const truncated = email.body.length > bodyMaxChars;
    return { ...email, body: truncated ? email.body.slice(0, bodyMaxChars) : email.body, truncated };
  }
}
