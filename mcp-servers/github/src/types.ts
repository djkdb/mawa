import { z } from 'zod';
import { clockNow } from '@mawa/shared';

/** Shape of a single GitHub item as returned by this server's tools. */
export const CommitSchema = z.object({
  sourceId: z.string(),
  repo: z.string(),
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.iso.datetime(),
  url: z.url(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});
export type Commit = z.infer<typeof CommitSchema>;

export const PullRequestSchema = z.object({
  sourceId: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  author: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  mergedAt: z.iso.datetime().nullable(),
  url: z.url(),
  reviewComments: z.number().int().nonnegative(),
  labels: z.array(z.string()),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export const IssueSchema = z.object({
  sourceId: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  author: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  url: z.url(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
});
export type Issue = z.infer<typeof IssueSchema>;

export const RepositoryActivitySchema = z.object({
  sourceId: z.string(),
  repo: z.string(),
  url: z.url(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  lastPushedAt: z.iso.datetime(),
  openIssues: z.number().int().nonnegative(),
  openPullRequests: z.number().int().nonnegative(),
  commitsInPeriod: z.number().int().nonnegative(),
  language: z.string().nullable(),
});
export type RepositoryActivity = z.infer<typeof RepositoryActivitySchema>;

/** The provider contract both demo and real implementations satisfy. */
export interface GitHubProvider {
  getRecentCommits(input: { since: string; until: string; repo?: string; limit: number }): Promise<Commit[]>;
  getPullRequests(input: { since: string; state: 'open' | 'closed' | 'merged' | 'all'; repo?: string; limit: number }): Promise<PullRequest[]>;
  getOpenIssues(input: { repo?: string; limit: number }): Promise<Issue[]>;
  getRepositoryActivity(input: { since: string; until: string; limit: number }): Promise<RepositoryActivity[]>;
}

export function defaultPeriod(): { since: string; until: string } {
  const until = new Date(clockNow());
  const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until: until.toISOString() };
}
