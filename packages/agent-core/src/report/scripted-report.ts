import type { LLMReport } from './prompt.js';

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
const repoShort = (full: unknown) => String(full ?? '').split('/')[1] ?? String(full ?? '');
const person = (from: unknown) => String(from ?? '').replace(/<.*>/, '').trim();
const STATE_KO: Record<string, string> = { open: '열림', merged: '병합됨', closed: '닫힘' };
const LABEL_KO: Record<string, string> = { bug: '버그', auth: '인증', 'priority:high': '우선순위 높음', enhancement: '개선', agent: '에이전트', portfolio: '포트폴리오', weekly: '주간 과제', mcp: 'MCP', chore: '정리', 'needs-review': '리뷰 필요' };
const labelsKo = (ls: string[]) => ls.map((l) => LABEL_KO[l] ?? l).join(', ');
const ageDays = (iso: unknown, now: number) => (typeof iso === 'string' ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null);
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
  return (m.title ?? '').replace(/^Re:\s*/i, '').replace(new RegExp(`^${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '');
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
 * Judgements (risks, priorities, next actions) are `inferred` and carry a priority derived from labels/keywords.
 */
export function buildScriptedReport(ctx: ScriptedContext, now = Date.now()): LLMReport {
  const intent = intentOf(ctx.request);
  const by = (kind: string) => ctx.items.filter((i) => (i.kind ?? i.sourceId.split(':')[1]) === kind);
  const commits = by('commit'), prs = by('pr'), issues = by('issue'), repos = by('repo'), emails = by('msg'), events = by('event');
  const f = (i: Item, k: string) => i.fields?.[k];
  const labelsOf = (i: Item) => (Array.isArray(f(i, 'labels')) ? (f(i, 'labels') as unknown[]).map(String) : []);
  const repoNames = new Set([...commits, ...prs, ...issues, ...repos].map((x) => repoShort(f(x, 'repo') ?? x.title)).filter(Boolean));

  // Work-relevant mail only: mentions a known repo, a PR/issue number, or work keywords. Personal mail (e.g. job applications) is left out.
  const workMail = emails.filter((m) => {
    const t = `${m.title ?? ''} ${f(m, 'snippet') ?? ''}`;
    return [...repoNames].some((r) => t.includes(r)) || /#\d+|\bPR\b|MCP|OAuth|review|리뷰|deploy|demo day|check-in|vulnerab|action required/i.test(t);
  });
  const actionMail = workMail.filter((m) => /action required|verification|vulnerab|blocked|bug|before friday|reproduced/i.test(`${m.title ?? ''} ${f(m, 'snippet') ?? ''}`));

  const issuePriority = (i: Item): Priority => (labelsOf(i).some((l) => /priority:high|bug/i.test(l)) ? 'high' : labelsOf(i).some((l) => /enhancement/i.test(l)) ? 'low' : 'medium');
  const mailPriority = (m: Item): Priority => (/action required|verification|before friday/i.test(`${m.title ?? ''} ${f(m, 'snippet') ?? ''}`) ? 'high' : 'medium');
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const byPriority = (xs: Out[]): Out[] => [...xs].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);
  const openPrs = prs.filter((p) => f(p, 'state') === 'open');
  const sortedEvents = [...events].sort((a, b) => String(f(a, 'start') ?? a.timestamp).localeCompare(String(f(b, 'start') ?? b.timestamp)));
  const upcoming = sortedEvents.filter((e) => new Date(String(f(e, 'start') ?? e.timestamp)).getTime() >= now);

  const issueRisk = (i: Item): Out => {
    const age = ageDays(f(i, 'createdAt'), now);
    const owner = Array.isArray(f(i, 'assignees')) && (f(i, 'assignees') as unknown[]).length ? `담당 ${(f(i, 'assignees') as unknown[]).join(', ')}` : '담당자 없음';
    return { text: `이슈 #${f(i, 'number')} ${i.title ?? ''} — ${labelsKo(labelsOf(i)) || '라벨 없음'} · ${owner}${age !== null ? ` · ${age}일째 열림` : ''}`, confidence: 'inferred', priority: issuePriority(i), sources: [i.sourceId] };
  };
  const prWait = (p: Item): Out => {
    const age = ageDays(f(p, 'createdAt'), now);
    return { text: `PR #${f(p, 'number')} ${p.title ?? ''} — 리뷰 대기${Number(f(p, 'reviewComments')) ? ` · 코멘트 ${f(p, 'reviewComments')}개 미반영` : ''}${age !== null ? ` · ${age}일째` : ''}`, confidence: 'inferred', priority: 'medium', sources: [p.sourceId] };
  };
  const mailAction = (m: Item): Out => ({ text: `${person(f(m, 'from'))} 메일 "${subject(m)}" — ${clip(String(f(m, 'snippet') ?? ''), 70)}`, confidence: 'inferred', priority: mailPriority(m), sources: [m.sourceId] });
  const eventLine = (e: Item, mark = false): Out => {
    const start = String(f(e, 'start') ?? e.timestamp);
    const past = new Date(start).getTime() < now;
    return { text: `${dt(start)} · ${e.title ?? ''}${f(e, 'location') ? ` (${f(e, 'location')})` : ''}${mark && past ? ' · 지남' : ''}`, confidence: 'observed', sources: [e.sourceId] };
  };

  const sections: LLMReport['sections'] = [];

  if (intent === 'blockers') {
    const blockers = byPriority([
      ...issues.filter((i) => issuePriority(i) !== 'low').map(issueRisk),
      ...openPrs.map(prWait),
      ...actionMail.map(mailAction),
    ]);
    const high = blockers.filter((b) => b.priority === 'high').length;
    sections.push({ id: 'overview', items: blockers.length ? [{ text: `막힌 항목 후보 ${blockers.length}건, 그중 우선순위 높음 ${high}건입니다. 열린 이슈와 리뷰 대기 PR, 조치가 필요한 메일에서 찾았습니다.`, confidence: 'inferred', sources: blockers.flatMap((b) => b.sources).slice(0, 12) }] : [{ text: '열린 이슈·리뷰 대기 PR·조치 필요 메일에서 막힌 항목을 찾지 못했습니다.', confidence: 'inferred', sources: [] }] });
    sections.push({ id: 'potential_risks', items: blockers });
    sections.push({
      id: 'next_actions',
      items: byPriority([
        ...issues.filter((i) => issuePriority(i) === 'high').map((i): Out => ({ text: `이슈 #${f(i, 'number')} 먼저 해결: ${i.title ?? ''}`, confidence: 'inferred', priority: 'high', sources: [i.sourceId] })),
        ...openPrs.map((p): Out => ({ text: `PR #${f(p, 'number')} 리뷰 코멘트 반영 후 재리뷰 요청`, confidence: 'inferred', priority: 'medium', sources: [p.sourceId] })),
        ...actionMail.filter((m) => mailPriority(m) === 'high').map((m): Out => ({ text: /noreply|no-reply/i.test(String(f(m, 'from') ?? '')) ? `처리 필요: ${subject(m)} (${person(f(m, 'from'))})` : `${person(f(m, 'from'))}에게 회신: ${subject(m)}`, confidence: 'inferred', priority: 'high', sources: [m.sourceId] })),
      ]),
    });
    return { sections: sections.filter((s) => s.items.length > 0) };
  }

  if (intent === 'priorities') {
    const top = byPriority([...issues.map(issueRisk), ...openPrs.map(prWait), ...actionMail.map(mailAction)]);
    const next = upcoming[0];
    sections.push({ id: 'overview', items: [
      ...(top.length ? [{ text: `이번 주 우선순위 1순위는 ${top[0]!.text.split(' — ')[0]}입니다.`, confidence: 'inferred' as const, priority: top[0]!.priority, sources: top[0]!.sources }] : []),
      ...(next ? [{ text: `가장 가까운 일정은 ${dt(String(f(next, 'start') ?? next.timestamp))} ${next.title ?? ''}입니다.`, confidence: 'observed' as const, sources: [next.sourceId] }] : []),
    ] });
    sections.push({ id: 'next_actions', items: byPriority([
      ...issues.map((i): Out => ({ text: `이슈 #${f(i, 'number')} 해결: ${i.title ?? ''}`, confidence: 'inferred', priority: issuePriority(i), sources: [i.sourceId] })),
      ...openPrs.map((p): Out => ({ text: `PR #${f(p, 'number')} 리뷰 코멘트 반영 후 병합 요청`, confidence: 'inferred', priority: 'medium', sources: [p.sourceId] })),
      ...upcoming.slice(0, 2).map((e): Out => ({ text: `${d(String(f(e, 'start') ?? e.timestamp))} ${e.title ?? ''} 준비`, confidence: 'inferred', priority: 'medium', sources: [e.sourceId] })),
    ]) });
    sections.push({ id: 'potential_risks', items: top.filter((t) => t.priority !== 'low').slice(0, 5) });
    sections.push({ id: 'schedule', items: upcoming.map((e) => eventLine(e)) });
    return { sections: sections.filter((s) => s.items.length > 0) };
  }

  // weekly
  const parts: string[] = [];
  const repoCount = repos.length || new Set(commits.map((c) => String(f(c, 'repo')))).size;
  if (commits.length) parts.push(`저장소 ${repoCount}곳에서 커밋 ${commits.length}개`);
  if (prs.length) parts.push(`PR ${prs.length}개`);
  if (issues.length) parts.push(`열린 이슈 ${issues.length}개`);
  if (events.length) parts.push(`일정 ${events.length}건`);
  if (workMail.length) parts.push(`업무 메일 ${workMail.length}건`);
  const overview: Out[] = [];
  if (parts.length) overview.push({ text: `이번 주 활동: ${parts.join(', ')}.`, confidence: 'observed', sources: [...commits, ...prs, ...issues, ...events, ...workMail].map((s) => s.sourceId).slice(0, 12) });
  const perRepo = new Map<string, Item[]>();
  for (const c of commits) { const r = String(f(c, 'repo')); perRepo.set(r, [...(perRepo.get(r) ?? []), c]); }
  const topRepo = [...perRepo.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (topRepo && perRepo.size > 1) overview.push({ text: `커밋의 대부분은 ${repoShort(topRepo[0])}에 집중됐습니다 (${commits.length}개 중 ${topRepo[1].length}개).`, confidence: 'inferred', sources: topRepo[1].map((c) => c.sourceId) });
  sections.push({ id: 'overview', items: overview });

  sections.push({
    id: 'major_activities',
    items: [...perRepo.entries()].map(([repo, cs]) => ({ text: `${repoShort(repo)}: 커밋 ${cs.length}개. ${cs.slice(0, 3).map((c) => `"${c.title ?? ''}"`).join(', ')}${cs.length > 3 ? ' 등' : ''}.`, confidence: 'observed' as const, sources: cs.map((c) => c.sourceId) })),
  });
  sections.push({
    id: 'project_progress',
    items: prs.map((p) => ({ text: `PR #${f(p, 'number')} (${STATE_KO[String(f(p, 'state'))] ?? f(p, 'state')}) · ${repoShort(f(p, 'repo'))}: ${p.title ?? ''}${Number(f(p, 'reviewComments')) ? ` · 리뷰 코멘트 ${f(p, 'reviewComments')}개` : ''}`, confidence: 'observed' as const, sources: [p.sourceId] })),
  });
  sections.push({ id: 'schedule', items: sortedEvents.map((e) => eventLine(e, true)) });
  sections.push({
    id: 'relevant_emails',
    items: workMail.slice(0, 6).map((m) => ({ text: `${d(m.timestamp)} · ${person(f(m, 'from'))}: ${subject(m)}${f(m, 'snippet') ? ` — ${clip(String(f(m, 'snippet')), 80)}` : ''}`, confidence: 'observed' as const, sources: [m.sourceId] })),
  });
  sections.push({ id: 'potential_risks', items: byPriority([...issues.filter((i) => issuePriority(i) !== 'low').map(issueRisk), ...actionMail.map(mailAction), ...openPrs.map(prWait)]) });
  sections.push({
    id: 'next_actions',
    items: byPriority([
      ...issues.slice(0, 3).map((i): Out => ({ text: `이슈 #${f(i, 'number')} 해결: ${i.title ?? ''}`, confidence: 'inferred', priority: issuePriority(i), sources: [i.sourceId] })),
      ...openPrs.slice(0, 1).map((p): Out => ({ text: `PR #${f(p, 'number')} 리뷰 코멘트 반영 후 병합 요청`, confidence: 'inferred', priority: 'medium', sources: [p.sourceId] })),
      ...upcoming.slice(0, 2).map((e): Out => ({ text: `${d(String(f(e, 'start') ?? e.timestamp))} ${e.title ?? ''} 준비`, confidence: 'inferred', priority: 'medium', sources: [e.sourceId] })),
    ]),
  });
  return { sections: sections.filter((s) => s.items.length > 0) };
}
