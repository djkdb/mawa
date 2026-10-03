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
export type ScriptedIntent = 'weekly' | 'priorities' | 'blockers';

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
const ddayKo = (n: number) => (n === 0 ? '오늘' : n === 1 ? '내일' : `D-${n}`);

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

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'agenda', 'week', 'weekly', 're', 'fwd', 'confirmed', 'slot', 'notes']);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9가-힣-]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
const overlap = (a: string, b: string) => { const tb = tokens(b); return [...tokens(a)].filter((w) => tb.has(w)).length; };
const refs = (s: string) => new Set([...s.matchAll(/#(\d+)/g)].map((m) => Number(m[1])));

const WEEKDAYS: Array<[RegExp, number, string]> = [
  [/\bmonday\b|월요일/i, 1, '월요일'], [/\btuesday\b|화요일/i, 2, '화요일'], [/\bwednesday\b|수요일/i, 3, '수요일'], [/\bthursday\b|목요일/i, 4, '목요일'],
  [/\bfriday\b|금요일/i, 5, '금요일'], [/\bsaturday\b|토요일/i, 6, '토요일'], [/\bsunday\b|일요일/i, 0, '일요일'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A date or weekday a mail states in its subject/snippet, if any. */
function statedWhen(text: string): { weekday?: number; month?: number; day?: number; label: string } | null {
  const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text) ?? null;
  if (md) return { month: MONTHS.indexOf(md[1]!.toLowerCase().slice(0, 3)) + 1, day: Number(md[2]), label: `${MONTHS.indexOf(md[1]!.toLowerCase().slice(0, 3)) + 1}월 ${md[2]}일` };
  const ko = /(\d{1,2})월\s*(\d{1,2})일/.exec(text);
  if (ko) return { month: Number(ko[1]), day: Number(ko[2]), label: `${ko[1]}월 ${ko[2]}일` };
  for (const [re, n, label] of WEEKDAYS) if (re.test(text)) return { weekday: n, label };
  return null;
}
function kstParts(iso: string) {
  const t = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return { weekday: t.getUTCDay(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export function intentOf(request?: string): ScriptedIntent {
  const r = request ?? '';
  if (/막히|블로커|block|지연|걸림/i.test(r)) return 'blockers';
  if (/중요|우선|다음 액션|next action|priorit/i.test(r)) return 'priorities';
  return 'weekly';
}

/**
 * Deterministic, data-only report writer used by ScriptedProvider (demo mode, tests).
 * Every sentence is built from fields present in the context: no invented names, numbers or dates.
 * Related sources are merged into one item per issue/PR (mails and events that reference "#N"),
 * priorities are scored from labels, deadlines, ownership and age, and each carries its reason.
 */
export function buildScriptedReport(ctx: ScriptedContext, now = Date.now()): LLMReport {
  const intent = intentOf(ctx.request);
  const by = (kind: string) => ctx.items.filter((i) => (i.kind ?? i.sourceId.split(':')[1]) === kind);
  const commits = by('commit'), prs = by('pr'), issues = by('issue'), repos = by('repo'), emails = by('msg'), events = by('event');
  const f = (i: Item, k: string) => i.fields?.[k];
  const str = (i: Item, k: string) => String(f(i, k) ?? '');
  const labelsOf = (i: Item) => (Array.isArray(f(i, 'labels')) ? (f(i, 'labels') as unknown[]).map(String) : []);
  const mailText = (m: Item) => `${m.title ?? ''} ${str(m, 'snippet')}`;
  const repoNames = new Set([...commits, ...prs, ...issues, ...repos].map((x) => repoShort(f(x, 'repo') ?? x.title)).filter(Boolean));
  const periodStart = new Date(ctx.period.start).getTime();
  const startOf = (e: Item) => String(f(e, 'start') ?? e.timestamp);

  // ---- classify mail -------------------------------------------------------
  const suspicious = emails.map((m) => ({ m, reason: detectInjection(mailText(m)) })).filter((x): x is { m: Item; reason: string } => x.reason !== null);
  const suspiciousIds = new Set(suspicious.map((x) => x.m.sourceId));
  const personal = emails.filter((m) => !suspiciousIds.has(m.sourceId) && (/recruit|application received|internship|채용|지원서|% off|promo|newsletter/i.test(`${mailText(m)} ${str(m, 'from')}`)));
  const personalIds = new Set(personal.map((m) => m.sourceId));
  // Work mail: mentions a known repo, a PR/issue number, or work keywords.
  const workMail = emails.filter((m) => !suspiciousIds.has(m.sourceId) && !personalIds.has(m.sourceId) && ([...repoNames].some((r) => mailText(m).includes(r)) || /#\d+|\bPR\b|MCP|OAuth|review|리뷰|deploy|demo day|check-in|vulnerab|action required/i.test(mailText(m))));
  const actionMail = workMail.filter((m) => /action required|verification|vulnerab|blocked|before friday|reproduced/i.test(mailText(m)));

  // ---- link mails and events to issues/PRs ---------------------------------
  const sortedEvents = [...events].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const upcoming = sortedEvents.filter((e) => new Date(startOf(e)).getTime() >= now);
  interface Topic { kind: 'issue' | 'pr'; item: Item; num: number; mails: Item[]; events: Item[]; deadline?: Item }
  const topics: Topic[] = [...issues.map((item) => ({ kind: 'issue' as const, item })), ...prs.filter((p) => str(p, 'state') === 'open').map((item) => ({ kind: 'pr' as const, item }))]
    .map(({ kind, item }) => {
      const num = Number(f(item, 'number'));
      const repoKey = norm(repoShort(f(item, 'repo')));
      const mails = workMail.filter((m) => refs(mailText(m)).has(num));
      const evs = sortedEvents.filter((e) => refs(e.title ?? '').has(num) || (kind === 'issue' && overlap(e.title ?? '', item.title ?? '') >= 2));
      // Deadline: the nearest upcoming event about this item, else about its repository (e.g. a demo day).
      const deadline = upcoming.find((e) => evs.includes(e)) ?? upcoming.find((e) => repoKey.length > 4 && norm(e.title ?? '').includes(repoKey));
      return { kind, item, num, mails, events: evs, ...(deadline ? { deadline } : {}) };
    });
  const linkedMail = new Set(topics.flatMap((t) => t.mails.map((m) => m.sourceId)));

  // ---- priority with reasons -----------------------------------------------
  const score = (t: Topic): { priority: Priority; reason: string } => {
    let s = 0;
    const why: string[] = [];
    const labels = labelsOf(t.item);
    if (labels.some((l) => /^bug$/i.test(l))) { s += 2; why.push('bug 라벨'); }
    if (labels.some((l) => /priority:high/i.test(l))) { s += 2; why.push('priority:high 라벨'); }
    if (labels.some((l) => /enhancement/i.test(l))) { s -= 1; why.push('개선 작업'); }
    if (t.kind === 'issue' && !(Array.isArray(f(t.item, 'assignees')) && (f(t.item, 'assignees') as unknown[]).length)) { s += 1; why.push('담당자 없음'); }
    if (t.kind === 'pr' && Number(f(t.item, 'reviewComments'))) { s += 1; why.push(`리뷰 코멘트 ${f(t.item, 'reviewComments')}개 미반영`); }
    if (t.deadline) {
      const n = dday(startOf(t.deadline), now);
      if (n <= 3) { s += 2; why.push(`${t.deadline.title} ${ddayKo(n)}`); } else if (n <= 10) { s += 1; why.push(`${t.deadline.title} ${ddayKo(n)}`); }
    }
    if (t.mails.length) { s += 1; why.push(`관련 메일 ${t.mails.length}건`); }
    const age = ageDays(f(t.item, 'createdAt'), now);
    if (age !== null && age >= 3) { s += 1; why.push(`${age}일째 열림`); }
    return { priority: s >= 3 ? 'high' : s >= 1 ? 'medium' : 'low', reason: why.join(' · ') || '특이 신호 없음' };
  };
  const mailScore = (m: Item): { priority: Priority; reason: string } =>
    /action required|verification|before friday/i.test(mailText(m)) ? { priority: 'high', reason: '조치를 요청하는 메일' } : /vulnerab/i.test(mailText(m)) ? { priority: 'medium', reason: '보안 알림 (심각도 moderate)' } : { priority: 'medium', reason: '확인이 필요한 메일' };
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const byPriority = (xs: Out[]): Out[] => [...xs].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);

  // ---- items ---------------------------------------------------------------
  const ownerOf = (t: Topic) => {
    const a = Array.isArray(f(t.item, 'assignees')) ? (f(t.item, 'assignees') as unknown[]).map(String) : [];
    return t.kind === 'pr' ? str(t.item, 'author') || '작성자' : a.length ? a.join(', ') : null;
  };
  const sourcesOf = (t: Topic) => [t.item.sourceId, ...t.mails.map((m) => m.sourceId), ...t.events.map((e) => e.sourceId)];
  const topicRisk = (t: Topic): Out => {
    const { priority, reason } = score(t);
    const age = ageDays(f(t.item, 'createdAt'), now);
    const fresh = typeof f(t.item, 'createdAt') === 'string' && new Date(str(t.item, 'createdAt')).getTime() >= periodStart;
    if (t.kind === 'pr') {
      const review = t.mails[0];
      return { text: `PR #${t.num} ${t.item.title ?? ''} — 리뷰 대기${Number(f(t.item, 'reviewComments')) ? ` · 코멘트 ${f(t.item, 'reviewComments')}개` : ''}${review && str(review, 'snippet') ? ` · ${person(f(review, 'from'))}: “${clip(str(review, 'snippet'), 70)}”` : ''}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    }
    const owner = ownerOf(t);
    return { text: `이슈 #${t.num} ${t.item.title ?? ''} — ${owner ? `담당 ${owner}` : '담당자 없음'} · ${fresh ? '이번 주 열림' : age !== null ? `${age}일째 열림` : '열림'}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
  };
  const topicAction = (t: Topic): Out => {
    const { priority, reason } = score(t);
    const owner = ownerOf(t);
    const when = t.deadline ? ` — ${dw(startOf(t.deadline))} ${t.deadline.title} 전` : '';
    if (t.kind === 'pr') {
      const reviewer = t.mails[0] ? person(f(t.mails[0], 'from')) : null;
      return { text: `${owner} · PR #${t.num} 리뷰 코멘트${Number(f(t.item, 'reviewComments')) ? ` ${f(t.item, 'reviewComments')}개` : ''} 반영 후 ${reviewer ? `${reviewer}에게 ` : ''}재리뷰 요청${when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    }
    if (!owner) return { text: `리드 · 이슈 #${t.num} 담당자 지정: ${t.item.title ?? ''}${when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
    const work = t.events.find((e) => upcoming.includes(e) && e !== t.deadline) ?? (t.deadline && t.events.includes(t.deadline) ? t.deadline : undefined);
    return { text: `${owner} · 이슈 #${t.num} ${labelsOf(t.item).some((l) => /^bug$/i.test(l)) ? '수정' : '진행'}: ${t.item.title ?? ''}${work ? ` — ${dw(startOf(work))} "${work.title}" 일정에서` : when}`, confidence: 'inferred', priority, reason, sources: sourcesOf(t) };
  };
  const standaloneMail = actionMail.filter((m) => !linkedMail.has(m.sourceId));
  const mailRisk = (m: Item): Out => ({ text: `${person(f(m, 'from'))} · ${subject(m)}`, confidence: 'inferred', ...mailScore(m), sources: [m.sourceId] });
  const mailAction = (m: Item): Out => ({ text: `나 · 처리: ${subject(m)} (${person(f(m, 'from'))})`, confidence: 'inferred', ...mailScore(m), sources: [m.sourceId] });

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
  const conflictRisk = ({ m, ev, said }: (typeof conflicts)[number]): Out => ({ text: `일정 확인 필요: "${ev.title}" — ${person(f(m, 'from'))} 메일은 ${said.label}, 캘린더는 ${dw(startOf(ev))}`, confidence: 'inferred', priority: dday(startOf(ev), now) <= 10 ? 'high' : 'medium', reason: '메일과 캘린더의 날짜가 다름', sources: [m.sourceId, ev.sourceId] });
  const conflictAction = ({ m, ev, said }: (typeof conflicts)[number]): Out => ({ text: `나 · ${person(f(m, 'from'))}에게 "${ev.title}" 날짜 확인 (메일 ${said.label} / 캘린더 ${dw(startOf(ev))})`, confidence: 'inferred', priority: dday(startOf(ev), now) <= 10 ? 'high' : 'medium', reason: '메일과 캘린더의 날짜가 다름', sources: [m.sourceId, ev.sourceId] });
  const suspiciousRisk = ({ m, reason }: (typeof suspicious)[number]): Out => ({ text: `의심 메일: "${subject(m)}" (${person(f(m, 'from'))}) — 모델에게 지시하는 문장이 있어 데이터로만 다루고 리포트 내용에 반영하지 않았습니다`, confidence: 'observed', priority: 'medium', reason: `${reason} 감지`, sources: [m.sourceId] });
  // Prep for an upcoming event when a mail asks for something about it.
  const prepActions = upcoming.slice(0, 4).flatMap((e): Out[] => {
    const m = workMail.find((x) => !linkedMail.has(x.sourceId) && overlap(subject(x), e.title ?? '') >= 2 && /prepare|준비|bring|update/i.test(str(x, 'snippet')));
    return m ? [{ text: `나 · ${dw(startOf(e))} ${e.title} 준비 — ${person(f(m, 'from'))} 요청: “${clip(str(m, 'snippet'), 70)}”`, confidence: 'inferred', priority: dday(startOf(e), now) <= 3 ? 'high' : 'medium', reason: `${ddayKo(dday(startOf(e), now))} · 준비 요청 메일`, sources: [e.sourceId, m.sourceId] }] : [];
  });

  const nonLow = topics.filter((t) => score(t).priority !== 'low');
  const risks = byPriority([...nonLow.map(topicRisk), ...conflicts.map(conflictRisk), ...standaloneMail.map(mailRisk), ...suspicious.map(suspiciousRisk)]);
  const actions = byPriority([...topics.map(topicAction), ...conflicts.map(conflictAction), ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map(mailAction), ...prepActions]);
  const eventLine = (e: Item, mark = false): Out => {
    const past = new Date(startOf(e)).getTime() < now;
    return { text: `${dt(startOf(e))} · ${e.title ?? ''}${f(e, 'location') ? ` (${f(e, 'location')})` : ''}${mark && past ? ' · 지남' : ''}`, confidence: 'observed', sources: [e.sourceId] };
  };
  const skipped = [personal.length ? `개인·광고 메일 ${personal.length}건` : '', suspicious.length ? `의심 메일 ${suspicious.length}건` : ''].filter(Boolean).join(', ');
  const sections: LLMReport['sections'] = [];

  if (intent === 'blockers') {
    // A blocker is something waiting on someone: a fix that gates a deadline, a review, an external approval, an unconfirmed date.
    const waiting = (o: Out, what: string): Out => ({ ...o, text: `${o.text} · 기다리는 것: ${what}` });
    const blockers = byPriority([
      ...topics.filter((t) => t.kind === 'issue' && score(t).priority === 'high').map((t) => waiting(topicRisk(t), '수정')),
      ...topics.filter((t) => t.kind === 'pr' && (score(t).priority === 'high' || Number(f(t.item, 'reviewComments')) > 0)).map((t) => waiting(topicRisk(t), '리뷰 코멘트 반영과 재리뷰')),
      ...topics.filter((t) => t.kind === 'issue' && score(t).priority === 'medium' && !ownerOf(t) && t.deadline).map((t) => waiting(topicRisk(t), '담당자 지정')),
      ...conflicts.map((c) => waiting(conflictRisk(c), '날짜 확인 회신')),
      ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map((m) => waiting(mailRisk(m), '외부 조치')),
    ]);
    const high = blockers.filter((b) => b.priority === 'high').length;
    sections.push({ id: 'overview', items: blockers.length ? [{ text: `막힌 항목 ${blockers.length}건, 그중 우선순위 높음 ${high}건입니다. 열린 이슈·리뷰 대기 PR·조치 요청 메일·일정 불일치에서 무언가를 기다리고 있는 것만 골랐습니다${skipped ? ` (${skipped}은 제외)` : ''}.`, confidence: 'inferred', sources: blockers.flatMap((b) => b.sources).slice(0, 12) }] : [{ text: '무언가를 기다리며 멈춘 항목을 찾지 못했습니다.', confidence: 'inferred', sources: [] }] });
    sections.push({ id: 'potential_risks', items: blockers });
    sections.push({ id: 'next_actions', items: byPriority([...topics.filter((t) => score(t).priority === 'high' || (!ownerOf(t) && t.deadline) || (t.kind === 'pr' && Number(f(t.item, 'reviewComments')) > 0)).map(topicAction), ...conflicts.map(conflictAction), ...standaloneMail.filter((m) => mailScore(m).priority === 'high').map(mailAction)]) });
    if (suspicious.length) sections.push({ id: 'relevant_emails', items: suspicious.map(suspiciousRisk) });
    return { sections: sections.filter((s) => s.items.length > 0) };
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
    return { sections: sections.filter((s) => s.items.length > 0) };
  }

  // weekly
  const parts: string[] = [];
  const repoCount = repos.length || new Set(commits.map((c) => str(c, 'repo'))).size;
  if (commits.length) parts.push(`저장소 ${repoCount}곳에서 커밋 ${commits.length}개`);
  if (prs.length) parts.push(`PR ${prs.length}개`);
  if (issues.length) parts.push(`열린 이슈 ${issues.length}개`);
  if (events.length) parts.push(`일정 ${events.length}건`);
  if (emails.length) parts.push(`메일 ${emails.length}건 중 업무 메일 ${workMail.length}건`);
  const overview: Out[] = [];
  if (parts.length) overview.push({ text: `이번 주 활동: ${parts.join(', ')}${skipped ? ` (${skipped} 제외)` : ''}.`, confidence: 'observed', sources: [...commits, ...prs, ...issues, ...events, ...workMail].map((s) => s.sourceId).slice(0, 12) });
  const highRisks = risks.filter((r) => r.priority === 'high');
  if (risks.length) overview.push({ text: `판단이 필요한 항목 ${risks.length}건, 그중 높음 ${highRisks.length}건${conflicts.length ? ` · 날짜가 어긋난 일정 ${conflicts.length}건` : ''}.`, confidence: 'inferred', sources: highRisks.flatMap((r) => r.sources).slice(0, 12) });
  const perRepo = new Map<string, Item[]>();
  for (const c of commits) { const r = str(c, 'repo'); perRepo.set(r, [...(perRepo.get(r) ?? []), c]); }
  const topRepo = [...perRepo.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (topRepo && perRepo.size > 1) overview.push({ text: `커밋의 대부분은 ${repoShort(topRepo[0])}에 집중됐습니다 (${commits.length}개 중 ${topRepo[1].length}개).`, confidence: 'inferred', sources: topRepo[1].map((c) => c.sourceId) });
  sections.push({ id: 'overview', items: overview });

  sections.push({
    id: 'major_activities',
    items: [...perRepo.entries()].map(([repo, cs]) => ({ text: `${repoShort(repo)}: 커밋 ${cs.length}개. ${cs.slice(0, 3).map((c) => `"${c.title ?? ''}"`).join(', ')}${cs.length > 3 ? ' 등' : ''}.`, confidence: 'observed' as const, sources: cs.map((c) => c.sourceId) })),
  });
  sections.push({
    id: 'project_progress',
    items: prs.map((p) => ({ text: `PR #${f(p, 'number')} (${STATE_KO[str(p, 'state')] ?? str(p, 'state')}) · ${repoShort(f(p, 'repo'))}: ${p.title ?? ''}${Number(f(p, 'reviewComments')) ? ` · 리뷰 코멘트 ${f(p, 'reviewComments')}개` : ''}`, confidence: 'observed' as const, sources: [p.sourceId] })),
  });
  sections.push({ id: 'schedule', items: sortedEvents.map((e) => eventLine(e, true)) });
  sections.push({
    id: 'relevant_emails',
    items: [
      ...workMail.slice(0, 6).map((m): Out => ({ text: `${d(m.timestamp)} · ${person(f(m, 'from'))}: ${subject(m)}${f(m, 'snippet') ? ` — ${clip(str(m, 'snippet'), 80)}` : ''}`, confidence: 'observed', sources: [m.sourceId] })),
    ],
  });
  sections.push({ id: 'potential_risks', items: risks });
  sections.push({ id: 'next_actions', items: actions.slice(0, 7) });
  return { sections: sections.filter((s) => s.items.length > 0) };
}
