import type { LLMReport } from './prompt.js';

/** Minimal view of the aggregated context the scripted provider receives. */
export interface ScriptedContext {
  period: { start: string; end: string };
  sources: Array<{ id: string; type: string; title: string; timestamp?: string }>;
  items: Array<{ sourceId: string; summary: string }>;
}

/**
 * Heuristic report used by ScriptedProvider. It only ever cites ids that are
 * in the context, and marks everything it cannot read off the data as inferred.
 */
export function buildScriptedReport(ctx: ScriptedContext): LLMReport {
  const byKind = (kind: string) => ctx.sources.filter((s) => s.id.split(':')[1] === kind);
  const commits = byKind('commit');
  const prs = byKind('pr');
  const issues = byKind('issue');
  const repos = byKind('repo');
  const emails = byKind('msg');
  const events = byKind('event');
  const summaryOf = (id: string) => ctx.items.find((i) => i.sourceId === id)?.summary ?? '';
  const repoOf = (id: string) => id.replace(/^github:\w+:/, '').split(/[@#]/)[0] ?? '';

  const sections: LLMReport['sections'] = [];

  // Overview mentions only what was actually retrieved; nothing is claimed about services that were not queried.
  const parts: string[] = [];
  if (commits.length || prs.length || issues.length) {
    const repoCount = repos.length || new Set(commits.map((c) => repoOf(c.id))).size;
    parts.push(`${commits.length} commits, ${prs.length} pull requests, ${issues.length} open issues across ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}`);
  }
  if (events.length) parts.push(`${events.length} calendar events`);
  if (emails.length) parts.push(`${emails.length} project-related emails`);
  const overviewItems: LLMReport['sections'][number]['items'] = [];
  if (parts.length) {
    overviewItems.push({ text: `This week: ${parts.join('; ')}.`, confidence: 'observed', sources: [...commits, ...prs, ...issues, ...events, ...emails].map((s) => s.id).slice(0, 12) });
  }
  const commitsByRepo = new Map<string, number>();
  for (const c of commits) commitsByRepo.set(repoOf(c.id), (commitsByRepo.get(repoOf(c.id)) ?? 0) + 1);
  const top = [...commitsByRepo.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && commitsByRepo.size > 1) {
    overviewItems.push({ text: `Most commit activity landed in ${top[0]} (${top[1]} of ${commits.length} commits).`, confidence: 'inferred', sources: commits.filter((c) => repoOf(c.id) === top[0]).map((c) => c.id) });
  }
  sections.push({ id: 'overview', items: overviewItems });

  const repoGroups = new Map<string, typeof commits>();
  for (const c of commits) {
    const r = repoOf(c.id);
    repoGroups.set(r, [...(repoGroups.get(r) ?? []), c]);
  }
  sections.push({
    id: 'major_activities',
    items: [...repoGroups.entries()].map(([repo, cs]) => ({
      text: `${repo}: ${cs.length} commits — ${cs.slice(0, 3).map((c) => `"${c.title}"`).join(', ')}${cs.length > 3 ? ', …' : ''}`,
      confidence: 'observed' as const,
      sources: cs.map((c) => c.id),
    })),
  });

  sections.push({
    id: 'project_progress',
    items: [
      ...prs.map((p) => ({ text: summaryOf(p.id), confidence: 'observed' as const, sources: [p.id] })),
      ...repos.map((r) => ({ text: summaryOf(r.id), confidence: 'observed' as const, sources: [r.id] })),
    ],
  });

  sections.push({
    id: 'schedule',
    items: events.map((e) => ({ text: summaryOf(e.id), confidence: 'observed' as const, sources: [e.id] })),
  });

  sections.push({
    id: 'relevant_emails',
    items: emails.slice(0, 6).map((e) => ({ text: summaryOf(e.id), confidence: 'observed' as const, sources: [e.id] })),
  });

  const riskIssues = issues.filter((i) => /bug|priority|budget|expire|refresh/i.test(summaryOf(i.id)));
  const riskEmails = emails.filter((e) => /action required|verification|vulnerab|blocked|bug/i.test(summaryOf(e.id)));
  sections.push({
    id: 'potential_risks',
    items: [
      ...riskIssues.map((i) => ({ text: `Open issue may block the demo: ${i.title}`, confidence: 'inferred' as const, sources: [i.id] })),
      ...riskEmails.map((e) => ({ text: `Needs attention: ${e.title}`, confidence: 'inferred' as const, sources: [e.id] })),
      ...(prs.some((p) => /open/.test(summaryOf(p.id))) ? [{ text: 'An open pull request is waiting on review; merge risk grows the longer it stays open.', confidence: 'inferred' as const, sources: prs.filter((p) => /open/.test(summaryOf(p.id))).map((p) => p.id) }] : []),
    ],
  });

  sections.push({
    id: 'next_actions',
    items: [
      ...issues.slice(0, 3).map((i) => ({ text: `Resolve: ${i.title}`, confidence: 'inferred' as const, sources: [i.id] })),
      ...events.slice(0, 2).map((e) => ({ text: `Prepare for: ${e.title}`, confidence: 'inferred' as const, sources: [e.id] })),
    ],
  });

  return { sections: sections.filter((s) => s.items.length > 0) };
}
