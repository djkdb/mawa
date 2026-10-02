import { google, type gmail_v1 } from 'googleapis';
import { googleAuthFromEnv } from '../google-auth.js';
import type { Email, EmailSummary, GmailProvider } from '../types.js';

/** Real provider over the Gmail API with the `gmail.readonly` scope. */
export class RealGmailProvider implements GmailProvider {
  private gmail: gmail_v1.Gmail;

  constructor(auth = googleAuthFromEnv()) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async searchEmails({ query, since, limit }: { query: string; since?: string; limit: number }): Promise<EmailSummary[]> {
    const q = since ? `${query} after:${Math.floor(new Date(since).getTime() / 1000)}` : query;
    const { data } = await this.gmail.users.messages.list({ userId: 'me', q, maxResults: limit });
    const out: EmailSummary[] = [];
    for (const m of data.messages ?? []) {
      if (!m.id) continue;
      const { data: msg } = await this.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] });
      out.push(toSummary(msg));
    }
    return out;
  }

  async getEmail({ messageId, bodyMaxChars }: { messageId: string; bodyMaxChars: number }): Promise<Email | null> {
    const { data: msg } = await this.gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    if (!msg.id) return null;
    const body = extractText(msg.payload);
    return { ...toSummary(msg), body: body.slice(0, bodyMaxChars), truncated: body.length > bodyMaxChars };
  }
}

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function toSummary(msg: gmail_v1.Schema$Message): EmailSummary {
  const id = msg.id ?? '';
  const dateMs = Number(msg.internalDate ?? Date.now());
  return {
    sourceId: `gmail:msg:${id}`,
    messageId: id,
    threadId: msg.threadId ?? '',
    subject: header(msg, 'Subject'),
    from: header(msg, 'From'),
    to: header(msg, 'To').split(',').map((s) => s.trim()).filter(Boolean),
    date: new Date(dateMs).toISOString(),
    snippet: msg.snippet ?? '',
    labels: msg.labelIds ?? [],
    url: `https://mail.google.com/mail/u/0/#inbox/${id}`,
  };
}

function extractText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const p of part.parts ?? []) {
    const t = extractText(p);
    if (t) return t;
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}
