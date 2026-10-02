import type { LLMReport } from './prompt.js';

/** Minimal view of the aggregated context the scripted provider receives (see buildAnalysisPrompt). */
export interface ScriptedContext {
  period: { start: string; end: string };
  sources: Array<{ id: string; type: string; title: string; timestamp?: string }>;
  items: Array<{ sourceId: string; kind?: string; title?: string; timestamp?: string; summary: string; fields?: Record<string, unknown> }>;
}

const TZ = 'Asia/Seoul';
const d = (iso?: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric' }) : '');
const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const repoShort = (full: unknown) => String(full ?? '').split('/')[1] ?? String(full ?? '');
const person = (from: unknown) => String(from ?? '').replace(/<.*>/, '').trim();
const STATE_KO: Record<string, string> = { open: '열림', merged: '병합됨', closed: '닫힘' };
type Item = ScriptedContext['items'][number];
type Out = LLMReport['sections'][number]['items'][number];

/**
 * Deterministic, data-only report writer used by ScriptedProvider (demo mode, tests).
 * Every sentence is built from fields that exist in the context; it never invents names, numbers or dates,
 * cites only ids from the context, and marks anything that is a judgement as `inferred`.
 */
export function buildScriptedReport(ctx: ScriptedContext): LLMReport {
  const by = (kind: string) => ctx.items.filter((i) => (i.kind ?? i.sourceId.split(':')[1]) === kind);
  const commits = by('commit'), prs = by('pr'), issues = by('issue'), repos = by('repo'), emails = by('msg'), events = by('event');
  const f = (i: Item, k: string) => i.fields?.[k];
  const sections: LLMReport['sections'] = [];

  // 이번 주 요약
  const parts: string[] = [];
  if (commits.length || prs.length || issues.length) {
    const repoCount = repos.length || new Set(commits.map((c) => String(f(c, 'repo')))).size;
    parts.push(`저장소 ${repoCount}곳에서 커밋 ${commits.length}개, PR ${prs.length}개, 열린 이슈 ${issues.length}개`);
  }
  if (events.length) parts.push(`일정 ${events.length}건`);
  if (emails.length) parts.push(`관련 메일 ${emails.length}건`);
  const overview: Out[] = [];
  if (parts.length) overview.push({ text: `이번 주 활동: ${parts.join(', ')}.`, confidence: 'observed', sources: [...commits, ...prs, ...issues, ...events, ...emails].map((s) => s.sourceId).slice(0, 12) });
  const perRepo = new Map<string, Item[]>();
  for (const c of commits) { const r = String(f(c, 'repo')); perRepo.set(r, [...(perRepo.get(r) ?? []), c]); }
  const top = [...perRepo.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (top && perRepo.size > 1) overview.push({ text: `커밋의 대부분은 ${repoShort(top[0])}에 집중됐습니다 (${commits.length}개 중 ${top[1].length}개).`, confidence: 'inferred', sources: top[1].map((c) => c.sourceId) });
  sections.push({ id: 'overview', items: overview });

  // 주요 작업: 저장소별 커밋
  sections.push({
    id: 'major_activities',
    items: [...perRepo.entries()].map(([repo, cs]) => ({
      text: `${repoShort(repo)}: 커밋 ${cs.length}개. ${cs.slice(0, 3).map((c) => `"${c.title ?? ''}"`).join(', ')}${cs.length > 3 ? ' 등' : ''}.`,
      confidence: 'observed' as const,
      sources: cs.map((c) => c.sourceId),
    })),
  });

  // 프로젝트 진행 상황: PR과 저장소 요약
  sections.push({
    id: 'project_progress',
    items: [
      ...prs.map((p) => ({
        text: `PR #${f(p, 'number')} (${STATE_KO[String(f(p, 'state'))] ?? f(p, 'state')}) · ${repoShort(f(p, 'repo'))}: ${p.title ?? ''}${Number(f(p, 'reviewComments')) ? ` · 리뷰 코멘트 ${f(p, 'reviewComments')}개` : ''}.`,
        confidence: 'observed' as const,
        sources: [p.sourceId],
      })),
      ...repos.map((r) => ({
        text: `${repoShort(r.title)}: 이번 기간 커밋 ${f(r, 'commitsInPeriod') ?? 0}개, 열린 이슈 ${f(r, 'openIssues') ?? 0}개.`,
        confidence: 'observed' as const,
        sources: [r.sourceId],
      })),
    ],
  });

  // 일정
  sections.push({
    id: 'schedule',
    items: events.map((e) => ({
      text: `${dt(String(f(e, 'start') ?? e.timestamp))} · ${e.title ?? ''}${f(e, 'location') ? ` (${f(e, 'location')})` : ''}.`,
      confidence: 'observed' as const,
      sources: [e.sourceId],
    })),
  });

  // 관련 이메일
  sections.push({
    id: 'relevant_emails',
    items: emails.slice(0, 6).map((m) => ({
      text: `${d(m.timestamp)} · ${person(f(m, 'from'))}: ${m.title ?? ''}${f(m, 'snippet') ? ` — ${String(f(m, 'snippet')).slice(0, 90)}${String(f(m, 'snippet')).length > 90 ? '…' : ''}` : ''}`,
      confidence: 'observed' as const,
      sources: [m.sourceId],
    })),
  });

  // 주의할 점 (추론)
  const labelsOf = (i: Item) => (Array.isArray(f(i, 'labels')) ? (f(i, 'labels') as unknown[]).map(String) : []);
  const riskIssues = issues.filter((i) => labelsOf(i).some((l) => /bug|priority/i.test(l)) || /refresh|expire|budget/i.test(i.title ?? ''));
  const riskEmails = emails.filter((m) => /action required|verification|vulnerab|blocked|bug/i.test(`${m.title ?? ''} ${f(m, 'snippet') ?? ''}`));
  const openPrs = prs.filter((p) => f(p, 'state') === 'open');
  sections.push({
    id: 'potential_risks',
    items: [
      ...riskIssues.map((i) => ({ text: `이슈 #${f(i, 'number')} "${i.title ?? ''}"${labelsOf(i).length ? ` (${labelsOf(i).join(', ')})` : ''}가 열려 있어 일정에 영향을 줄 수 있습니다.`, confidence: 'inferred' as const, sources: [i.sourceId] })),
      ...riskEmails.map((m) => ({ text: `${person(f(m, 'from'))}의 메일 "${m.title ?? ''}"은 조치가 필요해 보입니다.`, confidence: 'inferred' as const, sources: [m.sourceId] })),
      ...(openPrs.length ? [{ text: `열린 PR ${openPrs.length}개가 리뷰를 기다리고 있습니다. 오래 열려 있을수록 병합 충돌 위험이 커집니다.`, confidence: 'inferred' as const, sources: openPrs.map((p) => p.sourceId) }] : []),
    ],
  });

  // 다음 액션 (추론)
  sections.push({
    id: 'next_actions',
    items: [
      ...issues.slice(0, 3).map((i) => ({ text: `이슈 #${f(i, 'number')} 해결: ${i.title ?? ''}`, confidence: 'inferred' as const, sources: [i.sourceId] })),
      ...openPrs.slice(0, 1).map((p) => ({ text: `PR #${f(p, 'number')} 리뷰 코멘트 반영 후 병합 요청`, confidence: 'inferred' as const, sources: [p.sourceId] })),
      ...events.slice(0, 2).map((e) => ({ text: `${d(String(f(e, 'start') ?? e.timestamp))} ${e.title ?? ''} 준비`, confidence: 'inferred' as const, sources: [e.sourceId] })),
    ],
  });

  return { sections: sections.filter((s) => s.items.length > 0) };
}
