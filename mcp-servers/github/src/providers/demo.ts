import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { CommitSchema, IssueSchema, PullRequestSchema, RepositoryActivitySchema, type GitHubProvider } from '../types.js';
import { clockNow } from '@mawa/shared';

const FixtureSchema = z.object({
  commits: z.array(CommitSchema),
  pullRequests: z.array(PullRequestSchema),
  issues: z.array(IssueSchema),
  repositories: z.array(RepositoryActivitySchema),
});
type Fixture = z.infer<typeof FixtureSchema>;

/**
 * Demo provider: serves synthetic fixtures through the exact same tool
 * interface as the real provider. Dates in the fixture are relative
 * ("daysAgo") so the demo always looks like "this week".
 */
export class DemoGitHubProvider implements GitHubProvider {
  private fixture: Promise<Fixture>;

  constructor(fixturePath = fixtureFor('github')) {
    this.fixture = readFile(fixturePath, 'utf8').then((raw) => FixtureSchema.parse(rebaseDates(JSON.parse(raw))));
  }

  async getRecentCommits({ repo, limit }: { repo?: string; limit: number }) {
    const { commits } = await this.fixture;
    return commits.filter((c) => !repo || c.repo === repo).slice(0, limit);
  }

  async getPullRequests({ state, repo, limit }: { state: string; repo?: string; limit: number }) {
    const { pullRequests } = await this.fixture;
    return pullRequests
      .filter((p) => !repo || p.repo === repo)
      .filter((p) => state === 'all' || p.state === state)
      .slice(0, limit);
  }

  async getOpenIssues({ repo, limit }: { repo?: string; limit: number }) {
    const { issues } = await this.fixture;
    return issues.filter((i) => i.state === 'open' && (!repo || i.repo === repo)).slice(0, limit);
  }

  async getRepositoryActivity({ limit }: { limit: number }) {
    const { repositories } = await this.fixture;
    return repositories.slice(0, limit);
  }
}

/** Replace `{"$daysAgo": n}` markers with ISO timestamps relative to now. */
export function rebaseDates(value: unknown, now = clockNow()): unknown {
  if (Array.isArray(value)) return value.map((v) => rebaseDates(v, now));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['$daysAgo'] === 'number' && Object.keys(obj).length === 1) {
      return new Date(now - obj['$daysAgo'] * 86_400_000).toISOString();
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, rebaseDates(v, now)]));
  }
  return value;
}

/** The demo persona's fixture (MAWA_PERSONA, set by the MCP client): fixtures/<persona>/github.json, else the default (student) week. */
function fixtureFor(name: string): string {
  const persona = process.env['MAWA_PERSONA'];
  if (persona && /^[a-z]+$/.test(persona)) {
    const p = fileURLToPath(new URL(`../../fixtures/${persona}/${name}.json`, import.meta.url));
    if (existsSync(p)) return p;
  }
  return fileURLToPath(new URL(`../../fixtures/${name}.json`, import.meta.url));
}
