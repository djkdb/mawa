import { hrefFor } from './useHashRoute.js';

/**
 * Plain-Korean explanations for the failures people actually hit (seen on real Windows runs and in
 * tests): what happened, what to do, and where to go. The original message is kept for details.
 */
export interface FriendlyError { title: string; fix: string; action?: { label: string; href: string } }

const RULES: Array<[RegExp, FriendlyError]> = [
  [/OAuth session expired|Not logged in|Failed to authenticate|please run \/login/i, { title: 'Claude Code 로그인이 필요해요', fix: '터미널에서 claude 를 실행하고 /login → 브라우저에서 승인 → /exit 한 뒤 다시 실행하세요.' }],
  [/claude CLI not available|ENOENT.*claude|spawn claude/i, { title: 'Claude Code를 찾지 못했어요', fix: 'Claude Code가 설치돼 있는지 확인하세요 (claude --version). 경로가 특이하면 .env에 CLAUDE_BIN=<claude.exe 경로>를 넣고 서버를 다시 켜세요. npm run doctor가 확인해 줍니다.' }],
  [/Real mode needs at least one connected integration|No MCP server available/i, { title: '아직 연결된 서비스가 없어요', fix: '실제 데이터로 정리하려면 GitHub 같은 서비스를 먼저 연결하세요. 샘플로 보려면 모드를 「데모」로 바꾸세요.', action: { label: '연결하러 가기', href: hrefFor('connections') } }],
  [/Bad credentials|401|token refresh failed|reconnect GitHub/i, { title: 'GitHub 연결이 만료됐어요', fix: '연결 화면에서 GitHub를 해제했다가 다시 연결하세요.', action: { label: '연결 화면', href: hrefFor('connections') } }],
  [/rate limit/i, { title: 'GitHub 요청 한도에 걸렸어요', fix: '잠시(보통 몇 분) 뒤에 다시 실행하세요.' }],
  [/timed out|timeout/i, { title: 'AI 응답이 너무 오래 걸렸어요', fix: '네트워크 상태를 확인하고 다시 실행하세요. 계속되면 질문을 짧게 하거나 범위를 줄여 보세요.' }],
  [/API server unreachable|ECONNREFUSED|Failed to fetch|NetworkError|status 50\d/i, { title: 'API 서버가 꺼져 있어요', fix: '웹 화면만 켜지고 API(포트 3001)가 안 떠 있습니다. 켜 둔 npm run dev 창을 Ctrl+C로 끄고, npm run start:real 로 다시 켠 뒤 새로고침하세요. 터미널에 [api] listening on http://127.0.0.1:3001 줄이 보여야 합니다.' }],
  [/data policy can only be made stricter/i, { title: '서버 정책보다 느슨한 설정은 쓸 수 없어요', fix: '설정 화면의 데이터 정책을 서버 기본값보다 엄격하게만 바꿀 수 있습니다.', action: { label: '설정', href: hrefFor('settings') } }],
];

export function friendlyError(message: string | null | undefined): FriendlyError {
  const m = message ?? '';
  for (const [re, f] of RULES) if (re.test(m)) return f;
  return { title: '실행에 실패했어요', fix: '잠시 뒤 다시 실행해 보세요. 계속되면 아래 원문과 서버 터미널의 로그를 확인하세요.' };
}
