import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CommitSchema, IssueSchema, PullRequestSchema, RepositoryActivitySchema, defaultPeriod, type GitHubProvider } from './types.js';

export const SERVER_NAME = 'mawa-github';
export const SERVER_VERSION = '0.1.0';

const PeriodInput = {
  since: z.iso.datetime().optional().describe('ISO 8601 start of the period. Defaults to 7 days ago.'),
  until: z.iso.datetime().optional().describe('ISO 8601 end of the period. Defaults to now.'),
};

/**
 * Builds the GitHub MCP server over any provider. Tool names, descriptions and
 * schemas are the public contract consumed by the agent and the MCP Explorer.
 */
export function createGitHubMcpServer(provider: GitHubProvider, mode: 'demo' | 'real'): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const tag = mode === 'demo' ? ' [DEMO DATA]' : '';

  server.registerTool(
    'get_recent_commits',
    {
      title: 'Get recent commits',
      description: `Commits in the period, newest first, across the user's most recently pushed repositories or one repo. Each commit carries its author.${tag}`,
      inputSchema: z.object({
        ...PeriodInput,
        repo: z.string().optional().describe('Restrict to "owner/name".'),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      outputSchema: z.object({ summary: z.string(), data: z.array(CommitSchema) }),
    },
    async (args) => {
      const d = defaultPeriod();
      const data = await provider.getRecentCommits({ since: args.since ?? d.since, until: args.until ?? d.until, limit: args.limit, ...(args.repo ? { repo: args.repo } : {}) });
      return reply(`${data.length} commits across ${new Set(data.map((c) => c.repo)).size} repositories`, data);
    },
  );

  server.registerTool(
    'get_pull_requests',
    {
      title: 'Get pull requests',
      description: `Pull requests updated in the period, with state open/closed/merged.${tag}`,
      inputSchema: z.object({
        since: PeriodInput.since,
        state: z.enum(['open', 'closed', 'merged', 'all']).default('all'),
        repo: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      outputSchema: z.object({ summary: z.string(), data: z.array(PullRequestSchema) }),
    },
    async (args) => {
      const data = await provider.getPullRequests({ since: args.since ?? defaultPeriod().since, state: args.state, limit: args.limit, ...(args.repo ? { repo: args.repo } : {}) });
      const merged = data.filter((p) => p.state === 'merged').length;
      return reply(`${data.length} pull requests (${merged} merged, ${data.filter((p) => p.state === 'open').length} open)`, data);
    },
  );

  server.registerTool(
    'get_open_issues',
    {
      title: 'Get open issues',
      description: `Open issues assigned to the user (or all open issues of one repo).${tag}`,
      inputSchema: z.object({ repo: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }),
      outputSchema: z.object({ summary: z.string(), data: z.array(IssueSchema) }),
    },
    async (args) => {
      const data = await provider.getOpenIssues({ limit: args.limit, ...(args.repo ? { repo: args.repo } : {}) });
      return reply(`${data.length} open issues`, data);
    },
  );

  server.registerTool(
    'get_repository_activity',
    {
      title: 'Get repository activity',
      description: `Per-repository summary of activity in the period: commits, open issues, last push.${tag}`,
      inputSchema: z.object({ ...PeriodInput, limit: z.number().int().min(1).max(50).default(10) }),
      outputSchema: z.object({ summary: z.string(), data: z.array(RepositoryActivitySchema) }),
    },
    async (args) => {
      const d = defaultPeriod();
      const data = await provider.getRepositoryActivity({ since: args.since ?? d.since, until: args.until ?? d.until, limit: args.limit });
      return reply(`${data.length} active repositories`, data);
    },
  );

  return server;
}

function reply<T>(summary: string, data: T) {
  return { content: [{ type: 'text' as const, text: `${summary}\n${JSON.stringify(data, null, 2)}` }], structuredContent: { summary, data } };
}
