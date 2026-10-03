import { z } from 'zod';

/** Where a piece of context came from. One entry per integration. */
export const SourceTypeSchema = z.enum(['github', 'gmail', 'calendar', 'lms']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/**
 * A concrete, verifiable piece of data that a report item can cite:
 * a commit, a PR, an issue, an email, a calendar event.
 *
 * `id` is stable and namespaced by the producing MCP server, e.g.
 * `github:commit:abc123`, `gmail:msg:18c2...`, `calendar:event:7f3...`.
 */
export const SourceSchema = z.object({
  id: z.string().min(1),
  type: SourceTypeSchema,
  title: z.string(),
  url: z.url().optional(),
  timestamp: z.iso.datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Source = z.infer<typeof SourceSchema>;
