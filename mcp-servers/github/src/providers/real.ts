import { Octokit } from '@octokit/rest';
import type { Commit, GitHubProvider, Issue, PullRequest, RepositoryActivity } from '../types.js';

/**
 * Real provider: talks to the GitHub REST API with a user access token
 * (OAuth token from apps/api, or a personal access token for local use).
 * Only read endpoints are used.
 */
export class RealGitHubProvider implements GitHubProvider {
  private octokit: Octokit;

  constructor(token: string) {
    if (!token) throw new Error('GITHUB_TOKEN is required in real mode');
    this.octokit = new Octokit({ auth: token, userAgent: 'my-ai-work-agent' });
  }

  private async activeRepos(since: string, limit = 10): Promise<Array<{ owner: string; name: string }>> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({ sort: 'pushed', per_page: 30, affiliation: 'owner,collaborator' });
    return data
      .filter((r) => r.pushed_at && r.pushed_at >= since)
      .slice(0, limit)
      .map((r) => ({ owner: r.owner.login, name: r.name }));
  }

  private splitRepo(repo?: string) {
    if (!repo) return undefined;
    const [owner, name] = repo.split('/');
    if (!owner || !name) throw new Error(`repo must be "owner/name", got "${repo}"`);
    return { owner, name };
  }

  async getRecentCommits({ since, until, repo, limit }: { since: string; until: string; repo?: string; limit: number }): Promise<Commit[]> {
    const { data: me } = await this.octokit.users.getAuthenticated();
    const repos = this.splitRepo(repo) ? [this.splitRepo(repo)!] : await this.activeRepos(since);
    const out: Commit[] = [];
    for (const r of repos) {
      const { data } = await this.octokit.repos.listCommits({ owner: r.owner, repo: r.name, since, until, author: me.login, per_page: 50 });
      for (const c of data) {
        out.push({
          sourceId: `github:commit:${r.owner}/${r.name}@${c.sha.slice(0, 12)}`,
          repo: `${r.owner}/${r.name}`,
          sha: c.sha,
          message: c.commit.message,
          author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
          date: c.commit.author?.date ?? since,
          url: c.html_url,
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  }

  async getPullRequests({ since, state, repo, limit }: { since: string; state: 'open' | 'closed' | 'merged' | 'all'; repo?: string; limit: number }): Promise<PullRequest[]> {
    const repos = this.splitRepo(repo) ? [this.splitRepo(repo)!] : await this.activeRepos(since);
    const out: PullRequest[] = [];
    for (const r of repos) {
      const { data } = await this.octokit.pulls.list({ owner: r.owner, repo: r.name, state: 'all', sort: 'updated', direction: 'desc', per_page: 30 });
      for (const p of data) {
        if (p.updated_at < since) continue;
        const derived: PullRequest['state'] = p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed';
        if (state !== 'all' && derived !== state) continue;
        out.push({
          sourceId: `github:pr:${r.owner}/${r.name}#${p.number}`,
          repo: `${r.owner}/${r.name}`,
          number: p.number,
          title: p.title,
          state: derived,
          author: p.user?.login ?? 'unknown',
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          mergedAt: p.merged_at,
          url: p.html_url,
          reviewComments: 0,
          labels: p.labels.map((l) => l.name),
        });
      }
    }
    return out.slice(0, limit);
  }

  async getOpenIssues({ repo, limit }: { repo?: string; limit: number }): Promise<Issue[]> {
    const target = this.splitRepo(repo);
    const q = target ? `repo:${target.owner}/${target.name} is:issue is:open` : 'is:issue is:open assignee:@me';
    const { data } = await this.octokit.search.issuesAndPullRequests({ q, sort: 'updated', per_page: limit });
    return data.items.map((i) => {
      const fullRepo = i.repository_url.replace('https://api.github.com/repos/', '');
      return {
        sourceId: `github:issue:${fullRepo}#${i.number}`,
        repo: fullRepo,
        number: i.number,
        title: i.title,
        state: 'open' as const,
        author: i.user?.login ?? 'unknown',
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        url: i.html_url,
        labels: i.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
        assignees: (i.assignees ?? []).map((a) => a.login),
      };
    });
  }

  async getRepositoryActivity({ since, until, limit }: { since: string; until: string; limit: number }): Promise<RepositoryActivity[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({ sort: 'pushed', per_page: limit, affiliation: 'owner,collaborator' });
    const out: RepositoryActivity[] = [];
    for (const r of data) {
      if (!r.pushed_at || r.pushed_at < since) continue;
      const { data: commits } = await this.octokit.repos.listCommits({ owner: r.owner.login, repo: r.name, since, until, per_page: 100 });
      out.push({
        sourceId: `github:repo:${r.full_name}`,
        repo: r.full_name,
        url: r.html_url,
        description: r.description,
        defaultBranch: r.default_branch,
        lastPushedAt: r.pushed_at,
        openIssues: r.open_issues_count,
        openPullRequests: 0,
        commitsInPeriod: commits.length,
        language: r.language ?? null,
      });
    }
    return out;
  }
}
