import type { LLMReport } from './prompt.js';
import { detectInjection } from './guard.js';

/** Minimal view of the aggregated context the scripted provider receives (see buildAnalysisPrompt). */
export interface ScriptedContext {
  request?: string;
  period: { start: string; end: string };
  sources: Array<{ id: string; type: string; title: string; timestamp?: string }>;
  items: Array<{ sourceId: string; kind?: string; title?: string; timestamp?: string; summary: string; fields?: Record<string, unknown> }>;
}

type Item = ScriptedContext['items'][number];
type Out = LLMReport['sections'][number]['items'][number];
type Priority = NonNullable<Out['priority']>;
export type ScriptedIntent = 'weekly' | 'priorities' | 'blockers' | 'deadlines' | 'career';

const TZ = 'Asia/Seoul';
const DAY = 86_400_000;
const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const d = (iso?: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric' }) : '');
const dw = (iso?: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric', weekday: 'short' }) : '');
const repoShort = (full: unknown) => String(full ?? '').split('/')[1] ?? String(full ?? '');
const person = (from: unknown) => String(from ?? '').replace(/<.*>/, '').trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const STATE_KO: Record<string, string> = { open: '열림', merged: '병합됨', closed: '닫힘' };
const kstDay = (t: number) => Math.floor((t + 9 * 3_600_000) / DAY);
const ageDays = (iso: unknown, now: number) => (typeof iso === 'string' ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null);
const dday = (iso: string, now: number) => kstDay(new Date(iso).getTime()) - kstDay(now);
const ddayKo = (n: number) => (n === 0 ? '오늘' : n === 1 ? '내일' : n < 0 ? `${-n}일 지남` : `D-${n}`);

/** Sentence-boundary cut so previews never end mid-word. */
function clip(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`;
}
/** "GitHub: Dependabot alert…" from sender "GitHub" → "Dependabot alert…". */
function subject(m: Item) {
  const who = person(m.fields?.['from']);
  return (m.title ?? '').replace(/^(Re|Fwd?):\s*/i, '').replace(new RegExp(`^${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '');
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'agenda', 'week', 'weekly', 're', 'fwd', 'confirmed', 'slot', 'notes', '안내', '공지', '일정', '제출', '부탁', '이번', '리뷰', '요청', '수업', '진행']);
// Hangul words carry meaning at 2 characters (마감, 퀴즈, 발표); Latin needs 3.
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => (/[가-힣]/.test(w) ? w.length >= 2 : w.length >= 3) && !STOP.has(w) && !/^\d+(월|일)?$/.test(w)));
const overlap = (a: string, b: string) => { const tb = tokens(b); return [...tokens(a)].filter((w) => tb.has(w)).length; };
const refs = (s: string) => new Set([...s.matchAll(/#(\d+)/g)].map((m) => Number(m[1])));

const WEEKDAYS: Array<[RegExp, number, string]> = [
  [/\bmonday\b|월요일/i, 1, '월요일'], [/\btuesday\b|화요일/i, 2, '화요일'], [/\bwednesday\b|수요일/i, 3, '수요일'], [/\bthursday\b|목요일/i, 4, '목요일'],
  [/\bfriday\b|금요일/i, 5, '금요일'], [/\bsaturday\b|토요일/i, 6, '토요일'], [/\bsunday\b|일요일/i, 0, '일요일'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A date or weekday a mail states in its subject/snippet, if any. A date followed by 까지/마감 wins (deadline). */
function statedWhen(text: string): { weekday?: number; month?: number; day?: number; label: string; due: boolean } | null {
  const ko = [...text.matchAll(/(\d{1,2})월\s*(\d{1,2})일(\s*\d{1,2}:\d{2})?\s*(까지|마감)?/g)];
  const pick = ko.find((m) => m[4]) ?? ko[0];
  if (pick) return { month: Number(pick[1]), day: Number(pick[2]), label: `${pick[1]}월 ${pick[2]}일`, due: Boolean(pick[4]) || /마감|까지|due/i.test(text) };
  const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text);
  if (md) { const m = MONTHS.indexOf(md[1]!.toLowerCase().slice(0, 3)) + 1; return { month: m, day: Number(md[2]), label: `${m}월 ${md[2]}일`, due: /due|deadline|by /i.test(text) }; }
  for (const [re, n, label] of WEEKDAYS) if (re.test(text)) return { weekday: n, label, due: false };
  return null;
}
function kstParts(iso: string) {
  const t = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return { weekday: t.getUTCDay(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
/** "10월 9일" in the year of `now`, 23:59 KST, as ISO. */
function isoOf(month: number, day: number, now: number): string {
  const y = new Date(now + 9 * 3_600_000).getUTCFullYear();
  return new Date(Date.UTC(y, month - 1, day, 23 - 9, 59)).toISOString();
}

/** What area of a student's (or worker's) week an item belongs to. */
const AREAS: Array<[string, RegExp]> = [
  ['팀플', /캡스톤|팀플|team-mate|capstone|중간발표/i],
  ['취업', /인턴|채용|코딩테스트|면접|recruit|intern|interview|이력서/i],
  ['과제', /운영체제|데이터베이스|네트워크|과제|퀴즈|시험|중간고사|기말|eCampus|조교|homework|os-hw|보고서/i],
  ['공부', /스터디|BOJ|백준|baekjoon|알고리즘|algorithm/i],
  ['개발', /my-ai-work-agent|portfolio|포트폴리오|deploy|배포|cloudflare/i],
  ['학사', /장학금|학부|학생 포털|등록금|수강신청/i],
];
/** Gatherings on the calendar (team meetings, study sessions) are their own category. */
const MEETING = /회의|스터디|모임|미팅|sync|세미나|MT\b|면담/i;
const areaOf = (text: string) => AREAS.find(([, re]) => re.test(text))?.[0] ?? null;
const DEADLINE = /마감|제출|시험|퀴즈|중간고사|기말|발표|코딩테스트|면접|due|deadline|exam|quiz|interview/i;
const SUBMISSION_KO: Record<string, string> = { draft: '임시저장만 됨 (미제출)', new: '미제출', submitted: '제출 완료' };

export function intentOf(request?: string): ScriptedIntent {
  const r = request ?? '';
  if (/막히|놓친|블로커|block|지연|걸림/i.test(r)) return 'blockers';
  if (/인턴|취업|코딩테스트|채용|면접|career|job/i.test(r)) return 'career';
  if (/마감|시험|과제|deadline|due/i.test(r)) return 'deadlines';
  if (/중요|우선|다음 액션|next action|priorit/i.test(r)) return 'priorities';
  return 'weekly';
}

/**
 * Deterministic, data-only report writer used by ScriptedProvider (demo mode, tests).
 * Every sentence is built from fields present in the context: no invented names, numbers or dates.
 * Related sources are merged into one item per issue/PR (mails and events that reference it),
 * priorities are scored from labels, deadlines, ownership and age, and each carries its reason.
 */
export function buildScriptedReport(ctx: ScriptedContext, now = Date.now()): LLMReport {
  const intent = intentOf(ctx.request);
  const by = (kind: string) => ctx.items.filter((i) => (i.kind ?? i.sourceId.split(':')[1]) === kind);
  const commits = by('commit'), prs = by('pr'), issues = by('issue'), repos = by('repo'), emails = by('msg'), events = by('event');
  const lmsDue = by('due'), lmsAssign = by('assign');
  const f = (i: Item, k: string) => i.fields?.[k];
  const str = (i: Item, k: string) => String(f(i, k) ?? '');
  const labelsOf = (i: Item) => (Array.isArray(f(i, 'labels')) ? (f(i, 'labels') as unknown[]).map(String) : []);
  const mailText = (m: Item) => `${m.title ?? ''} ${str(m, 'snippet')}`;
  const itemText = (i: Item) => `${i.title ?? ''} ${str(i, 'repo')} ${labelsOf(i).join(' ')} ${i.kind === 'msg' ? `${str(i, 'snippet')} ${str(i, 'from')}` : ''}`;
  const repoNames = new Set([...commits, ...prs, ...issues, ...repos].map((x) => repoShort(f(x, 'repo') ?? x.title)).filter(Boolean));
  const periodStart = new Date(ctx.period.start).getTime();
  const startOf = (e: Item) => String(f(e, 'start') ?? e.timestamp);
  // "Me": the person who wrote most of the commits (the account the report is about).
  const authors = new Map<string, number>();
  const bump = (login: string) => { if (login) authors.set(login, (authors.get(login) ?? 0) + 1); };
  for (const c of commits) bump(str(c, 'author'));
  for (const i of issues) for (const a of Array.isArray(f(i, 'assignees')) ? (f(i, 'assignees') as unknown[]).map(String) : []) bump(a);
  const me = [...authors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const who = (login: string) => (login && login === me ? '나' : login);

  // ---- classify mail -------------------------------------------------------
  const suspicious = emails.map((m) => ({ m, reason: detectInjection(mailText(m)) })).filter((x): x is { m: Item; reason: string } => x.reason !== null);
  const suspiciousIds = new Set(suspicious.map((x) => x.m.sourceId));
  const promo = emails.filter((m) => !suspiciousIds.has(m.sourceId) && /% off|promo|newsletter|쿠폰|광고|할인/i.test(`${mailText(m)} ${str(m, 'from')}`));
  const promoIds = new Set(promo.map((m) => m.sourceId));
  // Relevant mail: about a known repo, an issue/PR number, or an area of the week (class, team, career, study, school).
  const workMail = emails.filter((m) => !suspiciousIds.has(m.sourceId) && !promoIds.has(m.sourceId) && ([...repoNames].some((r) => mailText(m).includes(r)) || /#\d+|\bPR\b|MCP|OAuth|review|리뷰|deploy|demo day|check-in|vulnerab|action required/i.test(mailText(m)) || areaOf(`${mailText(m)} ${str(m, 'from')}`) !== null));
  const actionMail = workMail.filter((m) => /action required|verification|vulnerab|blocked|before friday|reproduced|부탁|requested your review|리뷰 요청/i.test(mailText(m)));

  // ---- deadlines: dated events, and dates that mails give with 까지/마감 -----------
  const sortedEvents = [...events].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const upcoming = sortedEvents.filter((e) => new Date(startOf(e)).getTime() >= now);
  interface Deadline { at: string; title: string; area: string | null; event?: Item; mail?: Item; lms?: Item; submission?: string }
  const deadlines: Deadline[] = upcoming.filter((e) => DEADLINE.test(e.title ?? '')).map((e) => ({ at: startOf(e), title: e.title ?? '', area: areaOf(`${e.title ?? ''} ${e.summary}`), event: e }));
  for (const m of workMail) {
    const said = statedWhen(mailText(m));
    if (!said?.due || !said.month || !said.day) continue;
    const at = isoOf(said.month, said.day, now);
    if (new Date(at).getTime() < now) continue;
    const same = deadlines.find((x) => x.event && overlap(subject(m), x.title) >= 2);
    if (same) { same.mail = m; continue; }
    deadlines.push({ at, title: subject(m).replace(/^\[[^\]]+\]\s*/, '').replace(/\s*\([^)]*마감\)\s*$/, '').replace(/^\d{4}-\d\s*/, '').replace(/\s*안내$/, ''), area: areaOf(`${mailText(m)} ${str(m, 'from')}`), mail: m });
  }
  // LMS (eCampus) deadlines: merge with the same calendar/mail deadline, else add; carry my submission status.
  for (const u of lmsDue) {
    const at = str(u, 'due');
    if (!at || new Date(at).getTime() < now) continue;
    const title = u.title ?? '';
    const same = deadlines.find((x) => kstDay(new Date(x.at).getTime()) === kstDay(new Date(at).getTime()) && (overlap(title, x.title) >= 2 || (x.mail !== undefined && overlap(title, subject(x.mail)) >= 2)));
    const sub = lmsAssign.find((a) => (a.title ?? '') === title);
    const submission = sub ? str(sub, 'submission') : undefined;
    if (same) { same.lms = u; if (submission) same.submission = submission; continue; }
    deadlines.push({ at, title, area: areaOf(title) ?? '과제', lms: u, ...(submission ? { submission } : {}) });
  }
  deadlines.sort((a, b) => a.at.localeCompare(b.at));
  for (const dl of deadlines) if (!dl.mail) { const m = workMail.find((x) => overlap(subject(x), dl.title) >= 2); if (m) dl.mail = m; }

  // ---- link mails and events to issues/PRs ---------------------------------
  interface Topic { kind: 'issue' | 'pr'; item: Item; num: number; mails: Item[]; events: Item[]; deadline?: Item; reviewer?: boolean }
  const LABEL_HINT: Record<string, string> = { capstone: '캡스톤', homework: '과제' };
  const topics: Topic[] = [...issues.map((item) => ({ kind: 'issue' as const, item })), ...prs.filter((p) => str(p, 'state') === 'open').map((item) => ({ kind: 'pr' as const, item }))]
    .map(({ kind, item }) => {
      const num = Number(f(item, 'number'));
      const repoKey = norm(repoShort(f(item, 'repo')));
      const mails = workMail.filter((m) => refs(mailText(m)).has(num));
      const hints = labelsOf(item).map((l) => LABEL_HINT[l]).filter((x): x is string => Boolean(x));
      const evs = sortedEvents.filter((e) => refs(`${e.title ?? ''} ${e.summary}`).has(num) || (kind === 'issue' && overlap(e.title ?? '', item.title ?? '') >= 1));
      // Deadline: the nearest upcoming event about this item, else about its repository or label (e.g. a demo day, a capstone deadline).
      const deadline = upcoming.find((e) => evs.includes(e)) ?? upcoming.find((e) => (repoKey.length > 4 && norm(e.title ?? '').includes(repoKey)) || (DEADLINE.test(e.title ?? '') && hints.some((h) => (e.title ?? '').includes(h))));
      // A PR someone else opened that asks for my review.
      const reviewer = kind === 'pr' && str(item, 'author') !== me && mails.some((m) => /requested your review|리뷰 요청|리뷰도/i.test(`${mailText(m)} ${m.summary}`));
      return { kind, item, num, mails, events: evs, ...(deadline ? { deadline } : {}), ...(reviewer ? { reviewer } : {}) };
    });
  const linkedMail = new Set(topics.flatMap((t) => t.mails.map((m) => m.sourceId)));

  // ---- priority with reasons -----------------------------------------------
  const score = (t: Topic): { priority: Priority; reason: string } => {
    let s = 0;
    const why: string[] = [];
    const area = areaOf(itemText(t.item));
    if (area) why.push(area);
    const labels = labelsOf(t.item);
    if (labels.some((l) => /^bug$/i.test(l))) { s += 2; why.push('bug 라벨'); }
    if (labels.some((l) => /priority:high/i.test(l))) { s += 2; why.push('priority:high 라벨'); }
    if (labels.some((l) => /enhancement/i.test(l))) { s -= 1; why.push('개선 작업'); }
    if (t.kind === 'issue' && !(Array.isArray(f(t.item, 'assignees')) && (f(t.item, 'assignees') as unknown[]).length)) { s += 1; why.push('담당자 없음'); }
    if (t.reviewer) { s += 2; why.push('내 리뷰를 기다리는 중'); } else if (t.kind === 'pr' && Number(f(t.item, 'reviewComments'))) { s += 1; why.push(`리뷰 코멘트 ${f(t.item, 'reviewComments')}개 미반영`); }
    if (t.deadline) {
      const n = dday(startOf(t.deadline), now);
      if (n <= 3) { s += 2; why.push(`${t.deadline.title} ${ddayKo(n)}`); } else if (n <= 10) { s += 1; why.push(`${t.deadline.title} ${ddayKo(n)}`); }
    }
    if (t.mails.length) { s += 1; why.push(`관련 메일 ${t.mails.length}건`); }
    const age = ageDays(f(t.item, 'createdAt'), now);
    if (age !== null && age >= 3) { s += 1; why.push(`${age}일째 열림`); }
    return { priority: s >= 3 ? 'high' : s >= 1 ? 'medium' : 'low', reason: why.join(' · ') || '특이 신호 없음' };
  };
  const mailScore = (m: Item): { priority: Priority; reason: string } => {
    const area = areaOf(`${mailText(m)} ${str(m, 'from')}`);
    const pre = area ? `${area} · ` : '';
    return /action required|verification|before friday/i.test(mailText(m)) ? { priority: 'high', reason: `${pre}조치를 요청하는 메일` } : /vulnerab/i.test(mailText(m)) ? { priority: 'medium', reason: `${pre}보안 알림 (심각도 moderate)` } : { priority: 'medium', reason: `${pre}답을 기다리는 메일` };
  };
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const byPriority = (xs: Out[]): Out[] => [...xs].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);

  // ---- items ---------------------------------------------------------------
  const ownerOf = (t: Topic) => {
    const a = Array.isArray(f(t.item, 'assignees')) ? (f(t.item, 'assignees') as unknown[]).map(String) : [];
    return t.kind === 'pr' ? who(str(t.item, 'author')) || '작성자' : a.length ? a.map(who).join(', ') : null;
  };
  const sourcesOf = (t: Topic) => [t.item.sourceId, ...t.mails.map((m) => m.sourceId), ...t.events.map((e) => e.sourceId)];
  const topicRisk = (t: Topic): Out => {
    const { priority, reason } = score(t);
    const age = ageDays(f(t.item, 'createdAt'), now);
    const fresh = typeof f(t.item, 'createdAt') === 'string' && new Date(str(t.item, 'createdAt')).getTime() >= periodStart;
    if (t.kind === 'pr') {
      const review = t.mails[0];
      const state = t.reviewer ? `${who(str(t.item, 'author'))} 작성 · 내 리뷰 대기` : '리뷰 대기';
      return { text: `PR #${t.num} ${t.item.title ?? ''} — ${state}${Number(f(t.item, 'reviewComments')) ? ` · 코멘트 ${f(t.item, 'reviewComments')}개` : ''}${review && str(review, 'snippet') && !t.reviewer ? ` · ${person(f(review, 'from'))}: “${clip(str(review, 'snippet'), 70)}”` : ''}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    }
    const owner = ownerOf(t);
    const ask = t.mails.find((m) => /부탁|please|요청/i.test(str(m, 'snippet')));
    return { text: `이슈 #${t.num} ${t.item.title ?? ''} — ${owner ? `담당 ${owner}` : '담당자 없음'} · ${fresh ? '이번 주 열림' : age !== null ? `${age}일째 열림` : '열림'}${ask ? ` · ${person(f(ask, 'from'))}: “${clip(str(ask, 'snippet'), 60)}”` : ''}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
  };
  const topicAction = (t: Topic): Out => {
    const { priority, reason } = score(t);
    const owner = ownerOf(t);
    const when = t.deadline ? ` — ${dw(startOf(t.deadline))} ${t.deadline.title} 전` : '';
    if (t.kind === 'pr') {
      if (t.reviewer) return { text: `나 · PR #${t.num} 리뷰하기 (${who(str(t.item, 'author'))} 요청): ${t.item.title ?? ''}${when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
      const reviewer = t.mails[0] ? person(f(t.mails[0], 'from')) : null;
      return { text: `${owner} · PR #${t.num} ${Number(f(t.item, 'reviewComments')) ? `리뷰 코멘트 ${f(t.item, 'reviewComments')}개 반영 후 ` : ''}${reviewer ? `${reviewer}에게 ` : ''}${Number(f(t.item, 'reviewComments')) ? '재리뷰 요청' : '리뷰 요청'}${when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    }
    if (!owner) return { text: `팀 · 이슈 #${t.num} 담당자 정하기: ${t.item.title ?? ''}${when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    const work = t.events.find((e) => upcoming.includes(e) && e !== t.deadline) ?? (t.deadline && t.events.includes(t.deadline) ? t.deadline : undefined);
    return { text: `${owner} · 이슈 #${t.num} ${labelsOf(t.item).some((l) => /^bug$/i.test(l)) ? '수정' : '마무리'}: ${t.item.title ?? ''}${work ? ` — ${dw(startOf(work))} "${work.title}" 전` : when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
  };
  const standaloneMail = actionMail.filter((m) => !linkedMail.has(m.sourceId));
  const mailRisk = (m: Item): Out => ({ text: `${person(f(m, 'from'))} · ${subject(m)}`, confidence: 'inferred', ...mailScore(m), sources: [m.sourceId] });
  const mailAction = (m: Item): Out => ({ text: `나 · ${/noreply|no-reply|notifications/i.test(str(m, 'from')) ? '처리' : '회신'}: ${subject(m)} (${person(f(m, 'from'))})`, confidence: 'inferred', ...mailScore(m), sources: [m.sourceId] });

  // Mail states a day that the matching calendar event does not have.
  const conflicts = workMail.flatMap((m) => {
    const said = statedWhen(mailText(m));
    if (!said) return [];
    const ev = sortedEvents.find((e) => overlap(subject(m), e.title ?? '') >= 2);
    if (!ev) return [];
    const at = kstParts(startOf(ev));
    const differs = said.weekday !== undefined ? said.weekday !== at.weekday : said.month !== at.month || said.day !== at.day;
    return differs ? [{ m, ev, said }] : [];
  });
  const conflictRisk = ({ m, ev, said }: (typeof conflicts)[number]): Out => ({ text: `일정 확인 필요: "${ev.title}" — ${person(f(m, 'from'))} 메일은 ${said.label}, 캘린더는 ${dw(startOf(ev))}`, confidence: 'inferred', priority: dday(startOf(ev), now) <= 14 ? 'high' : 'medium', reason: `${areaOf(`${ev.title ?? ''} ${mailText(m)}`) ?? '일정'} · 메일과 캘린더의 날짜가 다름`, sources: [m.sourceId, ev.sourceId] });
  const conflictAction = ({ m, ev, said }: (typeof conflicts)[number]): Out => ({ text: `나 · "${ev.title}" 날짜 확인하고 캘린더 고치기 (메일 ${said.label} / 캘린더 ${dw(startOf(ev))}, ${person(f(m, 'from'))})`, confidence: 'inferred', priority: dday(startOf(ev), now) <= 14 ? 'high' : 'medium', reason: '메일과 캘린더의 날짜가 다름', sources: [m.sourceId, ev.sourceId] });
  const suspiciousRisk = ({ m, reason }: (typeof suspicious)[number]): Out => ({ text: `의심 메일: "${subject(m)}" (${person(f(m, 'from'))}) — 모델에게 지시하는 문장이 있어 데이터로만 다루고 리포트 내용에 반영하지 않았습니다`, confidence: 'observed', priority: 'medium', reason: `${reason} 감지`, sources: [m.sourceId] });

  // A deadline line, and the open work it depends on.
  const conflictIds = new Set(conflicts.map((c) => c.ev.sourceId));
  const dueWork = (dl: Deadline) => topics.filter((t) => t.kind === 'issue' && ((dl.event && (t.deadline === dl.event || t.events.includes(dl.event))) || overlap(t.item.title ?? '', dl.title) >= 2));
  const deadlineLine = (dl: Deadline): Out => {
    const n = dday(dl.at, now);
    const open = dueWork(dl);
    const srcs = [dl.event?.sourceId, dl.lms?.sourceId, dl.mail?.sourceId, ...open.map((t) => t.item.sourceId)].filter((x): x is string => Boolean(x));
    const sub = SUBMISSION_KO[dl.submission ?? ''];
    const origin = dl.event ? '캘린더 일정' : dl.lms ? 'eCampus 마감' : `${person(f(dl.mail!, 'from'))} 메일에 적힌 날짜`;
    return {
      text: `${ddayKo(n)} · ${dt(dl.at)} · ${dl.title}${sub ? ` · ${sub}` : ''}${open.length ? ` · 남은 일: ${open.map((t) => `#${t.num}`).join(', ')}` : ''}${dl.event && conflictIds.has(dl.event.sourceId) ? ' · 날짜 확인 필요' : ''}`,
      confidence: dl.event || dl.lms ? 'observed' : 'inferred',
      priority: n <= 2 || (dl.submission === 'draft' && n <= 3) ? 'high' : n <= 7 ? 'medium' : 'low',
      reason: [dl.area, origin, dl.lms && dl.event ? 'eCampus와 일치' : '', dl.lms && !dl.event && !dl.mail ? '캘린더·메일에는 없음' : '', dl.mail && (dl.event || dl.lms) ? `${person(f(dl.mail, 'from'))} 메일과 일치` : ''].filter(Boolean).join(' · '),
      sources: srcs,
    };
  };
  const prepAction = (dl: Deadline): Out | null => {
    const n = dday(dl.at, now);
    if (n > 7) return null;
    const open = dueWork(dl);
    const how = dl.submission === 'draft' ? 'eCampus에 최종 제출하기 (지금은 임시저장 상태)' : /코딩테스트/.test(dl.title) ? '그래프·최단경로 유형 복습, 응시 링크 메일 확인' : /퀴즈|시험/.test(dl.title) ? (str(dl.mail ?? dl.event!, 'snippet').match(/범위[:：]\s*([^.]+)/)?.[1] ? `범위 복습: ${str(dl.mail ?? dl.event!, 'snippet').match(/범위[:：]\s*([^.]+)/)![1]}` : '범위 복습') : open.length ? `${open.map((t) => `#${t.num} ${t.item.title ?? ''}`).join(', ')} 끝내기` : /장학금|신청/.test(dl.title) ? '포털에서 신청' : '준비';
    return { text: `나 · ${dl.title} 준비 — ${how} (${ddayKo(n)}, ${dw(dl.at)})`, confidence: 'inferred', priority: n <= 2 ? 'high' : 'medium', reason: `${dl.area ?? '마감'} · ${ddayKo(n)}${dl.submission ? ` · eCampus ${SUBMISSION_KO[dl.submission] ?? dl.submission}` : ''}`, sources: [dl.event?.sourceId, dl.lms?.sourceId, dl.mail?.sourceId, ...open.map((t) => t.item.sourceId)].filter((x): x is string => Boolean(x)) };
  };

  const nonLow = topics.filter((t) => score(t).priority !== 'low');
  const risks = byPriority([...nonLow.map(topicRisk), ...conflicts.map(conflictRisk), ...standaloneMail.map(mailRisk), ...suspicious.map(suspiciousRisk)]);
  const preps = deadlines.map(prepAction).filter((x): x is Out => x !== null);
  const coveredByPrep = new Set(deadlines.filter((dl) => prepAction(dl)).flatMap((dl) => dueWork(dl).map((t) => t.item.sourceId)));
  const actions = byPriority([...topics.filter((t) => !coveredByPrep.has(t.item.sourceId)).map(topicAction), ...preps, ...conflicts.map(conflictAction), ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map(mailAction)]);
  const eventLine = (e: Item, mark = false): Out => {
    const past = new Date(startOf(e)).getTime() < now;
    return { text: `${dt(startOf(e))} · ${e.title ?? ''}${f(e, 'location') ? ` (${f(e, 'location')})` : ''}${mark && past ? ' · 지남' : ''}`, confidence: 'observed', sources: [e.sourceId] };
  };
  const skipped = [promo.length ? `광고 메일 ${promo.length}건` : '', suspicious.length ? `의심 메일 ${suspicious.length}건` : ''].filter(Boolean).join(', ');
  const solved = commits.filter((c) => /BOJ\s*\d+|백준/i.test(c.title ?? ''));
  const sections: LLMReport['sections'] = [];
  // Every item gets a category (과제 / 팀플 / 개발 / 모임 / 취업 / 공부 / 학사 …) from what it cites.
  const byIdItem = new Map(ctx.items.map((i) => [i.sourceId, i]));
  const categorize = (o: Out): Out => {
    if (o.category) return o;
    if (o.text.startsWith('의심 메일')) return { ...o, category: '보안' };
    const cited = o.sources.map((id) => byIdItem.get(id)).filter((x): x is Item => Boolean(x));
    const first = cited[0];
    if (first && (first.kind ?? first.sourceId.split(':')[1]) === 'event' && cited.length === 1 && MEETING.test(first.title ?? '') && !DEADLINE.test(first.title ?? '')) return { ...o, category: '모임' };
    const text = `${o.text} ${cited.map((i) => itemText(i)).join(' ')}`;
    return { ...o, category: areaOf(text) ?? (first && MEETING.test(first.title ?? '') ? '모임' : '기타') };
  };
  const done = (r: LLMReport): LLMReport => ({ sections: r.sections.map((sec) => ({ ...sec, items: sec.id === 'overview' ? sec.items : sec.items.map(categorize) })) });

  if (intent === 'deadlines') {
    const soon = deadlines.filter((dl) => dday(dl.at, now) <= 7);
    sections.push({ id: 'overview', items: deadlines.length ? [{ text: `앞으로 2주 마감 ${deadlines.length}건, 그중 7일 안에 ${soon.length}건입니다. 가장 급한 것: ${deadlines[0]!.title} (${ddayKo(dday(deadlines[0]!.at, now))}).`, confidence: 'inferred', sources: deadlines.flatMap((dl) => [dl.event?.sourceId, dl.mail?.sourceId]).filter((x): x is string => Boolean(x)).slice(0, 12) }] : [{ text: '다가오는 마감을 찾지 못했습니다.', confidence: 'inferred', sources: [] }] });
    sections.push({ id: 'schedule', items: deadlines.map(deadlineLine) });
    const notInCalendar = deadlines.filter((dl) => dl.lms && !dl.event);
    const calendarAdd: Out[] = notInCalendar.length ? [{ text: `나 · 캘린더에 없는 eCampus 마감 ${notInCalendar.length}건 캘린더에 추가: ${notInCalendar.map((dl) => `${dl.title} (${d(dl.at)})`).join(', ')}`, confidence: 'inferred', priority: 'medium', reason: 'eCampus에만 있는 마감', sources: notInCalendar.map((dl) => dl.lms!.sourceId) }] : [];
    const unsubmitted: Out[] = deadlines.filter((dl) => dl.lms && (dl.submission === 'draft' || dl.submission === 'new') && dday(dl.at, now) <= 3).map((dl) => ({ text: `${dl.title} — ${SUBMISSION_KO[dl.submission!]} · ${ddayKo(dday(dl.at, now))}`, confidence: 'observed', priority: 'high', reason: `${dl.area ?? '과제'} · eCampus 제출 상태`, sources: [dl.lms!.sourceId, ...lmsAssign.filter((a) => a.title === dl.lms!.title).map((a) => a.sourceId)] }));
    sections.push({ id: 'next_actions', items: byPriority([...preps, ...calendarAdd]) });
    sections.push({ id: 'potential_risks', items: byPriority([...unsubmitted, ...conflicts.map(conflictRisk), ...topics.filter((t) => t.kind === 'issue' && deadlines.some((dl) => dday(dl.at, now) <= 3 && dueWork(dl).includes(t))).map((t) => ({ ...topicRisk(t), priority: 'high' as const, reason: `${score(t).reason} · 마감 3일 안인데 아직 열림` }))]) });
    return done({ sections: sections.filter((s) => s.items.length > 0) });
  }

  if (intent === 'career') {
    const careerTxt = (i: Item) => areaOf(itemText(i)) === '취업';
    const cMail = workMail.filter(careerTxt);
    const cEvents = sortedEvents.filter((e) => areaOf(`${e.title ?? ''} ${e.summary}`) === '취업');
    const cCommits = commits.filter(careerTxt);
    const cTopics = topics.filter((t) => careerTxt(t.item));
    const next = deadlines.find((dl) => dl.area === '취업');
    sections.push({ id: 'overview', items: [
      ...(next ? [{ text: `다음 전형: ${next.title} (${ddayKo(dday(next.at, now))}, ${dt(next.at)}).`, confidence: 'observed' as const, sources: [next.event?.sourceId, next.mail?.sourceId].filter((x): x is string => Boolean(x)) }] : []),
      ...(cCommits.length ? [{ text: `포트폴리오 작업: 이번 주 커밋 ${cCommits.length}개${cTopics.length ? `, 열린 이슈·PR ${cTopics.length}개` : ''}.`, confidence: 'observed' as const, sources: cCommits.map((c) => c.sourceId) }] : []),
      ...(solved.length ? [{ text: `코딩테스트 대비: 이번 주 백준 ${solved.length}문제 풀이 (${solved.map((c) => /BOJ\s*(\d+)/.exec(c.title ?? '')?.[1]).filter(Boolean).join(', ')}).`, confidence: 'observed' as const, sources: solved.map((c) => c.sourceId) }] : []),
    ] });
    sections.push({ id: 'schedule', items: cEvents.filter((e) => new Date(startOf(e)).getTime() >= now).map((e) => eventLine(e)) });
    sections.push({ id: 'next_actions', items: byPriority([...deadlines.filter((dl) => dl.area === '취업').map(prepAction).filter((x): x is Out => x !== null), ...cTopics.map(topicAction)]) });
    sections.push({ id: 'relevant_emails', items: cMail.map((m): Out => ({ text: `${d(m.timestamp)} · ${person(f(m, 'from'))}: ${subject(m)} — ${clip(str(m, 'snippet'), 80)}`, confidence: 'observed', sources: [m.sourceId] })) });
    if (cCommits.length) sections.push({ id: 'major_activities', items: [{ text: `${repoShort(f(cCommits[0]!, 'repo'))}: 커밋 ${cCommits.length}개. ${cCommits.slice(0, 3).map((c) => `"${c.title ?? ''}"`).join(', ')}${cCommits.length > 3 ? ' 등' : ''}.`, confidence: 'observed', sources: cCommits.map((c) => c.sourceId) }] });
    return done({ sections: sections.filter((s) => s.items.length > 0) });
  }

  if (intent === 'blockers') {
    // Something missed or stuck: waiting on me (a review, a teammate's ask), on a date to be confirmed, or a deadline with open work.
    const waiting = (o: Out, what: string): Out => ({ ...o, text: `${o.text} · 기다리는 것: ${what}` });
    const blockers = byPriority([
      ...topics.filter((t) => t.kind === 'issue' && score(t).priority === 'high').map((t) => waiting(topicRisk(t), t.mails.some((m) => /부탁|please/i.test(str(m, 'snippet'))) ? '내 정리 (팀원 요청)' : '수정')),
      ...topics.filter((t) => t.kind === 'pr' && (t.reviewer || Number(f(t.item, 'reviewComments')) > 0)).map((t) => waiting(topicRisk(t), t.reviewer ? '내 리뷰' : '리뷰 코멘트 반영과 재리뷰')),
      ...topics.filter((t) => t.kind === 'issue' && score(t).priority === 'medium' && !ownerOf(t) && t.deadline).map((t) => waiting(topicRisk(t), '담당자 정하기')),
      ...conflicts.map((c) => waiting(conflictRisk(c), '날짜 확인')),
      ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map((m) => waiting(mailRisk(m), '조치')),
    ]);
    const high = blockers.filter((b) => b.priority === 'high').length;
    sections.push({ id: 'overview', items: blockers.length ? [{ text: `놓치거나 막힌 항목 ${blockers.length}건, 그중 우선순위 높음 ${high}건입니다. 내 차례인 리뷰·팀원 요청, 날짜가 어긋난 일정, 담당자 없는 일을 골랐습니다${skipped ? ` (${skipped}은 제외)` : ''}.`, confidence: 'inferred', sources: blockers.flatMap((b) => b.sources).slice(0, 12) }] : [{ text: '무언가를 기다리며 멈춘 항목을 찾지 못했습니다.', confidence: 'inferred', sources: [] }] });
    sections.push({ id: 'potential_risks', items: blockers });
    sections.push({ id: 'next_actions', items: byPriority([...topics.filter((t) => score(t).priority === 'high' || (!ownerOf(t) && t.deadline) || t.reviewer || (t.kind === 'pr' && Number(f(t.item, 'reviewComments')) > 0)).map(topicAction), ...conflicts.map(conflictAction), ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map(mailAction)]) });
    if (suspicious.length) sections.push({ id: 'relevant_emails', items: suspicious.map(suspiciousRisk) });
    return done({ sections: sections.filter((s) => s.items.length > 0) });
  }

  if (intent === 'priorities') {
    const top = risks[0];
    const next = upcoming[0];
    sections.push({ id: 'overview', items: [
      ...(top ? [{ text: `1순위: ${top.text.split(' — ')[0]}.`, confidence: 'inferred' as const, ...(top.priority ? { priority: top.priority } : {}), ...(top.reason ? { reason: top.reason } : {}), sources: top.sources }] : []),
      ...(next ? [{ text: `가장 가까운 일정은 ${dt(startOf(next))} ${next.title ?? ''}입니다.`, confidence: 'observed' as const, sources: [next.sourceId] }] : []),
    ] });
    sections.push({ id: 'next_actions', items: actions });
    sections.push({ id: 'potential_risks', items: risks.slice(0, 5) });
    sections.push({ id: 'schedule', items: upcoming.map((e) => eventLine(e)) });
    return done({ sections: sections.filter((s) => s.items.length > 0) });
  }

  // weekly
  const parts: string[] = [];
  const repoCount = repos.length || new Set(commits.map((c) => str(c, 'repo'))).size;
  if (commits.length) parts.push(`저장소 ${repoCount}곳에서 커밋 ${commits.length}개`);
  if (solved.length) parts.push(`백준 ${solved.length}문제`);
  if (prs.length) parts.push(`PR ${prs.length}개`);
  if (issues.length) parts.push(`열린 이슈 ${issues.length}개`);
  if (events.length) parts.push(`일정 ${events.length}건`);
  if (emails.length) parts.push(`메일 ${emails.length}건 중 챙길 메일 ${workMail.length}건`);
  const overview: Out[] = [];
  if (parts.length) overview.push({ text: `이번 주 활동: ${parts.join(', ')}${skipped ? ` (${skipped} 제외)` : ''}.`, confidence: 'observed', sources: [...commits, ...prs, ...issues, ...events, ...workMail].map((s) => s.sourceId).slice(0, 12) });
  const soon = deadlines.filter((dl) => dday(dl.at, now) <= 7);
  if (soon.length) overview.push({ text: `7일 안 마감 ${soon.length}건: ${soon.map((dl) => `${dl.title}(${ddayKo(dday(dl.at, now))})`).join(', ')}.`, confidence: 'observed', sources: soon.flatMap((dl) => [dl.event?.sourceId, dl.mail?.sourceId]).filter((x): x is string => Boolean(x)) });
  const highRisks = risks.filter((r) => r.priority === 'high');
  if (risks.length) overview.push({ text: `챙겨야 할 항목 ${risks.length}건, 그중 높음 ${highRisks.length}건${conflicts.length ? ` · 날짜가 어긋난 일정 ${conflicts.length}건` : ''}.`, confidence: 'inferred', sources: highRisks.flatMap((r) => r.sources).slice(0, 12) });
  const perRepo = new Map<string, Item[]>();
  for (const c of commits) { const r = str(c, 'repo'); perRepo.set(r, [...(perRepo.get(r) ?? []), c]); }
  sections.push({ id: 'overview', items: overview });

  sections.push({
    id: 'major_activities',
    items: [...perRepo.entries()].sort((a, b) => b[1].length - a[1].length).map(([repo, cs]) => ({ text: `${repoShort(repo)}: 커밋 ${cs.length}개. ${cs.slice(0, 3).map((c) => `"${c.title ?? ''}"`).join(', ')}${cs.length > 3 ? ' 등' : ''}.`, confidence: 'observed' as const, sources: cs.map((c) => c.sourceId) })),
  });
  sections.push({
    id: 'project_progress',
    items: prs.map((p) => ({ text: `PR #${f(p, 'number')} (${STATE_KO[str(p, 'state')] ?? str(p, 'state')}) · ${repoShort(f(p, 'repo'))}: ${p.title ?? ''}${Number(f(p, 'reviewComments')) ? ` · 리뷰 코멘트 ${f(p, 'reviewComments')}개` : ''}`, confidence: 'observed' as const, sources: [p.sourceId] })),
  });
  sections.push({ id: 'schedule', items: sortedEvents.map((e) => eventLine(e, true)) });
  sections.push({
    id: 'relevant_emails',
    items: workMail.slice(0, 7).map((m): Out => ({ text: `${d(m.timestamp)} · ${person(f(m, 'from'))}: ${subject(m)}${f(m, 'snippet') ? ` — ${clip(str(m, 'snippet'), 80)}` : ''}`, confidence: 'observed', sources: [m.sourceId] })),
  });
  sections.push({ id: 'potential_risks', items: risks });
  sections.push({ id: 'next_actions', items: actions.slice(0, 10) });
  return done({ sections: sections.filter((s) => s.items.length > 0) });
}
