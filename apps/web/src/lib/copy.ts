import { persona } from './persona.js';
import type { McpServerId, ReportSectionId, Source } from '@mawa/shared';

/** Korean-first product copy. Technical identifiers stay as they are in the data. */
export const SECTION_TITLE: Record<ReportSectionId, string> = {
  overview: '이번 주 요약',
  major_activities: '공부·개발 기록',
  project_progress: 'PR·프로젝트',
  schedule: '일정·마감',
  relevant_emails: '챙겨야 할 메일',
  potential_risks: '놓치면 안 되는 것',
  next_actions: '이번 주 할 일',
};

/** The demo workspace: a fictional week shaped after the author's (CBNU Software student) life. */
/** The demo workspace's person; follows the persona switch (see lib/persona.ts). */
export const DEMO_PERSONA = { get name() { return persona().name; }, get short() { return persona().short; }, get school() { return persona().role; } };

export const PRIORITY_KO = { high: '높음', medium: '보통', low: '낮음' } as const;

/** Section titles adapt to the question: the blockers run's risks are its blockers. */
export function sectionTitle(id: ReportSectionId, prompt: string | null): string {
  const p = prompt ?? '';
  if (id === 'potential_risks' && /막히|놓친|블로커|block/i.test(p)) return '놓친 것·막힌 것';
  if (id === 'schedule' && /마감|시험|과제/.test(p)) return '마감 순서';
  if (id === 'potential_risks' && /마감|시험|과제/.test(p)) return '위험한 마감';
  if (id === 'schedule' && /인턴|취업|코딩테스트/.test(p)) return '다가오는 전형';
  if (id === 'major_activities' && /인턴|취업|코딩테스트/.test(p)) return '포트폴리오 작업';
  if (id === 'relevant_emails' && /인턴|취업|코딩테스트/.test(p)) return '채용 메일';
  if (id === 'overview' && /중요|우선/.test(p)) return '우선순위 요약';
  return SECTION_TITLE[id];
}

/** "D-3" style label relative to a reference instant (the run's generation time). */
export function relDay(iso: string, ref: number): string {
  const day = (t: number) => Math.floor((t + 9 * 3_600_000) / 86_400_000);
  const diff = day(new Date(iso).getTime()) - day(ref);
  return diff === 0 ? '오늘' : diff === 1 ? '내일' : diff > 0 ? `D-${diff}` : `${-diff}일 전`;
}

/** The report period's end is exclusive (next Monday 00:00); show the last included day. */
export function periodKo(p: { start: string; end: string }): string {
  // The period is a calendar week in the workspace timezone (agent-core defaultPeriod).
  const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, month: 'long', day: 'numeric' });
  return `${day(p.start)} – ${day(new Date(new Date(p.end).getTime() - 1).toISOString())}`;
}

export const SERVER_NAME: Record<McpServerId, string> = { github: 'GitHub', gmail: 'Gmail', calendar: 'Google Calendar', lms: 'eCampus' };
export const SOURCE_TYPE_NAME: Record<Source['type'], string> = SERVER_NAME;
export const KIND_NAME: Record<string, string> = { commit: '커밋', pr: 'PR', issue: '이슈', repo: '저장소', msg: '이메일', event: '일정', due: 'eCampus 마감', assign: '과제', course: '과목' };

export const EXAMPLE_META: Record<string, { title: string; hint: string; uses: McpServerId[] }> = {
  'weekly-progress': { title: '이번 주 정리', hint: '커밋·백준·팀플 PR, 수업 메일, 일정, eCampus 마감을 한 번에', uses: ['github', 'calendar', 'gmail', 'lms'] },
  deadlines: { title: '마감 순서', hint: 'eCampus 과제·퀴즈와 제출 상태, 발표·신청 마감을 D-day 순으로', uses: ['lms', 'calendar', 'gmail', 'github'] },
  career: { title: '취업 준비 현황', hint: '인턴 전형 일정, 코딩테스트 대비, 포트폴리오 작업', uses: ['gmail', 'calendar', 'github'] },
  blockers: { title: '놓친 것·막힌 것', hint: '내 차례인 리뷰, 팀원 부탁, 어긋난 일정, 미제출 과제', uses: ['github', 'gmail', 'calendar', 'lms'] },
  'worker-weekly': { title: '주간 보고', hint: '커밋·PR·장애·고객 문의·회의를 팀장님께 보낼 보고로', uses: ['github', 'gmail', 'calendar'] },
  'worker-deadlines': { title: '다음 주 일정', hint: '회신 마감·권한 만료·배포·회의를 D-day 순으로', uses: ['calendar', 'gmail', 'github'] },
  'worker-blockers': { title: '막힌 것', hint: '내 리뷰 대기, 장애 이슈, 어긋난 일정', uses: ['github', 'gmail', 'calendar'] },
  'worker-1on1': { title: '1:1 준비', hint: '팀장님 1:1 전에 우선순위만', uses: ['github', 'gmail', 'calendar'] },
};

/** "Searching → Searched" style verb pairs per tool, with the result summary translated where it is a known shape. */
export const TOOL_VERB: Record<string, [running: string, done: string]> = {
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
  get_courses: ['수강 과목을 가져오는 중', '수강 과목 확인'],
  get_upcoming_deadlines: ['eCampus 마감을 가져오는 중', 'eCampus 마감 확인'],
  get_assignments: ['과제 제출 상태를 확인하는 중', '과제 제출 상태 확인'],
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
  const lmsDue = n(/(\d+) LMS deadlines/); if (lmsDue) return `eCampus 마감 ${lmsDue}건`;
  const asg = summary.match(/(\d+) assignments due, (\d+) not submitted/); if (asg) return `과제 ${asg[1]}개 · 미제출 ${asg[2]}개`;
  const courses = n(/(\d+) courses/); if (courses) return `수강 과목 ${courses}개`;
  const emails = n(/(\d+) (?:project-related )?emails/); if (emails) return `이메일 ${emails}건`;
  const upcoming = n(/(\d+) upcoming events/); if (upcoming) return `다가오는 일정 ${upcoming}건`;
  const events = n(/(\d+) events/); if (events) return `일정 ${events}건`;
  return summary;
}

/** All UI dates use the workspace timezone so they match the report text (written in Asia/Seoul). */
export const WORKSPACE_TZ = 'Asia/Seoul';
export function timeKo(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: WORKSPACE_TZ, month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
export function dateKo(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, month: 'long', day: 'numeric' });
}

/** One hue per source, used for icons, chips, tiles and activity rows. */
export const SERVER_COLOR: Record<McpServerId, string> = { github: 'var(--color-github)', gmail: 'var(--color-gmail)', calendar: 'var(--color-calendar)', lms: 'var(--color-lms)' };
export const KIND_SERVER: Record<string, McpServerId> = { commit: 'github', pr: 'github', issue: 'github', repo: 'github', msg: 'gmail', event: 'calendar', due: 'lms', assign: 'lms', course: 'lms' };

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
  get_courses: 'eCampus(Moodle)에서 수강 중인 과목 목록을 가져옵니다.',
  get_upcoming_deadlines: 'eCampus에서 앞으로 N일 안에 해야 할 것(과제 제출, 퀴즈 응시)을 가까운 순으로 가져옵니다. 끝낸 것은 빠집니다.',
  get_assignments: '마감이 다가오는 과제와 내 제출 상태(제출됨 / 임시저장 / 미제출)를 가져옵니다.',
};

/** What each OAuth scope lets the token do, in plain words. Shown before connecting. */
export const SCOPE_MEANING: Record<string, { label: string; risk?: string }> = {
  'read:user': { label: 'GitHub 프로필 읽기' },
  repo: { label: '저장소·이슈·PR 읽기', risk: 'GitHub OAuth App의 repo 권한은 쓰기도 허용합니다. 이 앱은 읽기 API만 호출하며, 읽기 전용이 필요하면 GitHub App으로 연결하세요(GITHUB_OAUTH_SCOPES).' },
  'https://www.googleapis.com/auth/gmail.readonly': { label: 'Gmail 읽기 전용', risk: '사서함 전체를 읽을 수 있는 권한입니다. 에이전트는 기간·키워드로 좁혀 검색하고 본문은 요청한 메일만 길이 제한을 두고 읽습니다.' },
  'https://www.googleapis.com/auth/calendar.readonly': { label: 'Google Calendar 읽기 전용' },
  openid: { label: '로그인 확인' },
  email: { label: '계정 이메일 확인' },
};
export const DEFAULT_SCOPES = { github: ['read:user', 'repo'], google: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'] };

/** Report item categories, in display order. The key is what the agent writes into item.category. */
export const CATEGORIES: Array<{ key: string; label: string; color: string }> = [
  { key: '과제', label: '수업·과제', color: 'var(--color-cat-task)' },
  { key: '팀플', label: '팀플', color: 'var(--color-cat-team)' },
  { key: '개발', label: '개발', color: 'var(--color-cat-dev)' },
  { key: '모임', label: '모임', color: 'var(--color-cat-meet)' },
  { key: '취업', label: '취업', color: 'var(--color-cat-job)' },
  { key: '공부', label: '공부', color: 'var(--color-cat-study)' },
  { key: '학사', label: '학사', color: 'var(--color-cat-school)' },
  { key: '보안', label: '보안', color: 'var(--color-cat-security)' },
  { key: '기타', label: '기타', color: 'var(--color-cat-other)' },
];
export const categoryOf = (key: string | undefined) => { const c = CATEGORIES.find((x) => x.key === key) ?? CATEGORIES[CATEGORIES.length - 1]!; return { ...c, label: persona().categoryLabel[c.key] ?? c.label }; };
/** Categories in display order with the active persona's labels. */
export const categoriesFor = () => CATEGORIES.map((c) => ({ ...c, label: persona().categoryLabel[c.key] ?? c.label }));

/** Kinds of personal identifiers the agent masks for the LLM (DLP-style detection). */
export const PII_LABEL: Record<string, string> = { phone: '전화번호', studentNo: '학번', rrn: '주민등록번호', account: '계좌번호', card: '카드번호' };
export const piiBreakdown = (kinds: Partial<Record<string, number>> | undefined) => Object.entries(kinds ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${PII_LABEL[k] ?? k} ${n}`).join(' · ');
