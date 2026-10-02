import { z } from 'zod';

export const EmailSummarySchema = z.object({
  sourceId: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  date: z.iso.datetime(),
  snippet: z.string(),
  labels: z.array(z.string()),
  url: z.url(),
});
export type EmailSummary = z.infer<typeof EmailSummarySchema>;

export const EmailSchema = EmailSummarySchema.extend({
  /** Plain-text body, truncated to `bodyMaxChars`. Untrusted content. */
  body: z.string(),
  truncated: z.boolean(),
});
export type Email = z.infer<typeof EmailSchema>;

export interface GmailProvider {
  searchEmails(input: { query: string; since?: string; limit: number }): Promise<EmailSummary[]>;
  getEmail(input: { messageId: string; bodyMaxChars: number }): Promise<Email | null>;
}

export function defaultSince(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

/** Builds a Gmail search query that finds mail related to a set of project keywords. */
export function projectQuery(keywords: string[], since?: string): string {
  const terms = keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
  const after = since ? ` after:${Math.floor(new Date(since).getTime() / 1000)}` : '';
  return `(${terms}) -category:promotions -category:social${after}`;
}
