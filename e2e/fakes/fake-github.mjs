/**
 * TEST ONLY. A stand-in for github.com (OAuth) and api.github.com (REST) so the web e2e can take the
 * real-mode path — GitHub App sign-in, token exchange, the real GitHub MCP server calling the REST
 * API — without an account. Everything here is fictional and labelled as such.
 * Usage: node e2e/fakes/fake-github.mjs <port>
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 3901);
const TOKEN = 'fake-user-token';
const now = Date.now();
const iso = (hoursAgo) => new Date(now - hoursAgo * 3600_000).toISOString();
const REPO = { owner: { login: 'fake-dev' }, name: 'fake-service', full_name: 'fake-dev/fake-service', html_url: 'https://example.invalid/fake-dev/fake-service', description: '가짜 저장소 (e2e)', default_branch: 'main', pushed_at: iso(2), open_issues_count: 1, language: 'TypeScript' };
const COMMITS = [
  { sha: 'aaaaaaaaaaaa1111', html_url: 'https://example.invalid/c/1', author: { login: 'fake-dev' }, commit: { message: '[가짜] 로그인 화면 추가', author: { name: 'fake-dev', date: iso(3) } } },
  { sha: 'bbbbbbbbbbbb2222', html_url: 'https://example.invalid/c/2', author: { login: 'fake-dev' }, commit: { message: '[가짜] 결제 API 타임아웃 수정', author: { name: 'fake-dev', date: iso(26) } } },
];
const PULLS = [{ number: 7, title: '[가짜] 회원가입 검증 리뷰 요청', state: 'open', html_url: 'https://example.invalid/pr/7', user: { login: 'fake-dev' }, created_at: iso(30), updated_at: iso(4), merged_at: null, labels: [{ name: 'review' }] }];
const ISSUES = [{ number: 9, title: '[가짜] 배포 스크립트 실패', repository_url: `http://localhost:${port}/repos/fake-dev/fake-service`, html_url: 'https://example.invalid/i/9', user: { login: 'fake-dev' }, created_at: iso(50), updated_at: iso(5), labels: [{ name: 'bug' }], assignees: [{ login: 'fake-dev' }] }];
let refreshed = 0;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let body = '';
  for await (const chunk of req) body += chunk;

  // --- github.com: the consent screen and the token endpoint -------------------------------
  if (url.pathname === '/login/oauth/authorize') {
    const back = new URL(url.searchParams.get('redirect_uri') ?? '');
    back.searchParams.set('code', 'fake-code');
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>Fake GitHub</title><h1>가짜 GitHub 승인 화면 (e2e)</h1><p>scope=${url.searchParams.get('scope') ?? '(없음 — GitHub App)'}</p><a href="${back}">Authorize</a>`);
    return;
  }
  if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') {
    const b = JSON.parse(body || '{}');
    if (b.client_id !== 'fake-client' || b.client_secret !== 'fake-secret') return json(res, 200, { error: 'incorrect_client_credentials' });
    if (b.grant_type === 'refresh_token') refreshed += 1;
    else if (b.code !== 'fake-code') return json(res, 200, { error: 'bad_verification_code' });
    // GitHub App user token: expires, comes with a refresh token, no scope string.
    return json(res, 200, { access_token: TOKEN, token_type: 'bearer', expires_in: 28800, refresh_token: 'fake-refresh', refresh_token_expires_in: 15897600, scope: '' });
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/__fake/stats') return json(res, 200, { refreshed });

  // --- api.github.com: read endpoints the GitHub MCP server uses ---------------------------
  if (!/^(Bearer|token) fake-user-token$/.test(req.headers.authorization ?? '')) return json(res, 401, { message: 'Bad credentials' });
  if (url.pathname === '/user') return json(res, 200, { login: 'fake-dev', email: 'fake-dev@example.invalid' });
  if (url.pathname === '/user/repos') return json(res, 200, [REPO]);
  if (url.pathname === '/repos/fake-dev/fake-service/commits') return json(res, 200, COMMITS);
  if (url.pathname === '/repos/fake-dev/fake-service/pulls') return json(res, 200, PULLS);
  if (url.pathname === '/issues' || url.pathname === '/repos/fake-dev/fake-service/issues') return json(res, 200, ISSUES);
  if (req.method === 'DELETE' && url.pathname.startsWith('/applications/')) { res.writeHead(204); res.end(); return; }
  json(res, 404, { message: `fake GitHub has no ${req.method} ${url.pathname}` });
}).listen(port, '127.0.0.1', () => console.log(`fake GitHub on http://localhost:${port}`));
