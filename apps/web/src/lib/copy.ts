import type { McpServerId, ReportSectionId, Source } from '@mawa/shared';

/** Korean-first product copy. Technical identifiers stay as they are in the data. */
export const SECTION_TITLE: Record<ReportSectionId, string> = {
  overview: '이번 주 요약',
  major_activities: '주요 작업',
  project_progress: '프로젝트 진행 상황',
  schedule: '일정',
  relevant_emails: '관련 이메일',
  potential_risks: '주의할 점',
  next_actions: '다음 액션',
};

export const SERVER_NAME: Record<McpServerId, string> = { github: 'GitHub', gmail: 'Gmail', calendar: 'Google Calendar' };
export const SOURCE_TYPE_NAME: Record<Source['type'], string> = SERVER_NAME;
export const KIND_NAME: Record<string, string> = { commit: '커밋', pr: 'PR', issue: '이슈', repo: '저장소', msg: '이메일', event: '일정' };

export const EXAMPLE_META: Record<string, { title: string; hint: string; uses: McpServerId[] }> = {
  'weekly-progress': { title: '이번 주 진행 상황 정리', hint: '커밋·PR·이슈, 일정, 관련 메일을 모아 주간 리포트로', uses: ['github', 'calendar', 'gmail'] },
  priorities: { title: '가장 중요한 작업과 다음 액션', hint: '열린 PR·이슈와 다가오는 일정에서 우선순위 도출', uses: ['github', 'calendar', 'gmail'] },
  blockers: { title: '막히고 있는 부분 찾기', hint: '열린 이슈·PR과 조치가 필요한 메일에서 블로커 추출', uses: ['github', 'gmail'] },
};

/** "Searching → Searched" style verb pairs per tool, with the result summary translated where it is a known shape. */
const TOOL_VERB: Record<string, [running: string, done: string]> = {
  get_recent_commits: ['최근 커밋을 가져오는 중', '최근 커밋 확인'],
  get_pull_requests: ['Pull Request를 가져오는 중', 'Pull Request 확인'],
  get_open_issues: ['열린 이슈를 가져오는 중', '열린 이슈 확인'],
  get_repository_activity: ['저장소 활동을 요약하는 중', '저장소 활동 확인'],
  search_emails: ['이메일을 검색하는 중', '이메일 검색'],
  get_email: ['이메일 본문을 읽는 중', '이메일 본문 확인'],
  search_project_emails: ['프로젝트 관련 메일을 찾는 중', '프로젝트 관련 메일 확인'],
  get_events: ['이번 주 일정을 가져오는 중', '이번 주 일정 확인'],
  get_upcoming_events: ['다가오는 일정을 가져오는 중', '다가오는 일정 확인'],
  search_events: ['일정을 검색하는 중', '일정 검색'],
};
export function toolLabel(server: McpServerId, name: string, done: boolean): string {
  const v = TOOL_VERB[name];
  return `${SERVER_NAME[server]} · ${v ? v[done ? 1 : 0] : name}`;
}

/** Translate the server's English summary ("12 commits across 2 repositories") into a short Korean result. */
export function summaryKo(summary: string): string {
  const n = (re: RegExp) => summary.match(re)?.[1];
  const commits = n(/(\d+) commits/); if (commits) return `커밋 ${commits}개`;
  const prs = n(/(\d+) pull requests/); if (prs) { const open = n(/(\d+) open/); const merged = n(/(\d+) merged/); return `PR ${prs}개${merged || open ? ` (병합 ${merged ?? 0}, 열림 ${open ?? 0})` : ''}`; }
  const issues = n(/(\d+) open issues/); if (issues) return `열린 이슈 ${issues}개`;
  const repos = n(/(\d+) active repositories/); if (repos) return `활동 중인 저장소 ${repos}개`;
  const emails = n(/(\d+) (?:project-related )?emails/); if (emails) return `이메일 ${emails}건`;
  const upcoming = n(/(\d+) upcoming events/); if (upcoming) return `다가오는 일정 ${upcoming}건`;
  const events = n(/(\d+) events/); if (events) return `일정 ${events}건`;
  return summary;
}

export function timeKo(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function dateKo(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

/** One hue per source, used for icons, chips, tiles and activity rows. */
export const SERVER_COLOR: Record<McpServerId, string> = { github: 'var(--color-github)', gmail: 'var(--color-gmail)', calendar: 'var(--color-calendar)' };
export const KIND_SERVER: Record<string, McpServerId> = { commit: 'github', pr: 'github', issue: 'github', repo: 'github', msg: 'gmail', event: 'calendar' };

export const TOOL_DESC_KO: Record<string, string> = {
  get_recent_commits: '기간 내 커밋을 최신순으로 가져옵니다. 최근 푸시된 저장소 전체 또는 지정한 저장소 하나.',
  get_pull_requests: '기간 내 갱신된 Pull Request를 열림·닫힘·병합 상태와 함께 가져옵니다.',
  get_open_issues: '나에게 할당된 열린 이슈, 또는 특정 저장소의 열린 이슈를 가져옵니다.',
  get_repository_activity: '저장소별 활동 요약: 기간 내 커밋 수, 열린 이슈, 마지막 푸시 시각.',
  search_emails: 'Gmail 검색 문법으로 메일을 찾습니다. 본문 없이 요약만 반환합니다.',
  get_email: '메일 한 통의 본문을 가져옵니다(길이 제한). 본문은 신뢰할 수 없는 입력으로 취급합니다.',
  search_project_emails: '저장소·프로젝트·동료 이름 같은 키워드로 프로젝트 관련 메일을 찾습니다. 광고·소셜 메일은 제외.',
  get_events: '기본 캘린더의 일정을 기간으로 조회합니다. 기본값은 이번 주(월–일).',
  get_upcoming_events: '지금부터 N일 동안의 다가오는 일정을 가져옵니다.',
  search_events: '제목·설명·장소를 텍스트로 검색합니다(기본 ±30일).',
};
