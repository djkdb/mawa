/**
 * GitHub OAuth Apps have no read-only repository scope: `repo` grants read AND write on repositories.
 * This project only calls read endpoints, but the token itself is not read-only.
 * For least privilege, register a GitHub App with read-only permissions (Contents, Issues,
 * Pull requests, Metadata) and set GITHUB_OAUTH_SCOPES="" — GitHub App user tokens take their
 * permissions from the app, not from a scope parameter.
 */
export const DEFAULT_GITHUB_SCOPES = ['read:user', 'repo'];
export function githubScopesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env['GITHUB_OAUTH_SCOPES'];
  if (raw === undefined) return DEFAULT_GITHUB_SCOPES;
  return raw.split(/[\s,]+/).filter(Boolean);
}
