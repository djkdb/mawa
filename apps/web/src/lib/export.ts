import type { Source, WeeklyWorkReport } from '@mawa/shared';
import { PRIORITY_KO, periodKo, sectionTitle } from './copy.js';

function chip(s: Source): string {
  const k = String(s.metadata['kind'] ?? '');
  if (k === 'pr' || k === 'issue') return `${k === 'pr' ? 'PR' : '이슈'} #${s.id.split('#')[1]}`;
  if (k === 'commit') return `커밋 ${s.id.split('@')[1]?.slice(0, 7) ?? ''}`;
  if (k === 'msg') return '메일';
  if (k === 'event') return '일정';
  return s.title;
}

export interface ExportOptions { title: string; prompt: string | null; hidden: Set<string>; format: 'markdown' | 'slack' }

const clipText = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/**
 * A Slack update, not the whole report: 한 일 / 할 일 / 막힌 것, at most 5 lines each.
 * Hidden items are left out; in real mode the first citation becomes a Slack link.
 */
function slackUpdate(report: WeeklyWorkReport, o: ExportOptions): string {
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const items = (id: string) => report.sections.find((s) => s.id === id)?.items.filter((i) => !o.hidden.has(i.id)) ?? [];
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const ref = (ids: string[]) => {
    const s = ids.map((id) => byId.get(id)).find((x): x is Source => Boolean(x));
    if (!s) return '';
    return s.url && report.mode !== 'demo' ? ` <${s.url}|${chip(s)}>` : '';
  };
  const line = (i: { text: string; sources: string[]; priority?: string | undefined }, max = 110) => `• ${i.priority === 'high' ? '*[높음]* ' : ''}${clipText(i.text, max)}${ref(i.sources)}`;
  const done = [...items('major_activities'), ...items('project_progress').filter((i) => /병합|merged/i.test(i.text))].slice(0, 5);
  const todo = [...items('next_actions')].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']).slice(0, 5);
  const blocked = [...items('potential_risks')].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']).filter((i) => i.priority !== 'low').slice(0, 3);
  const out = [`*${o.title}* · ${periodKo(report.period)}${report.mode === 'demo' ? ' · 샘플 데이터' : ''}`];
  if (done.length) out.push('', '*한 일*', ...done.map((i) => line(i, 90)));
  if (todo.length) out.push('', '*할 일*', ...todo.map((i) => line(i)));
  if (blocked.length) out.push('', '*막힌 것 · 주의*', ...blocked.map((i) => line(i)));
  if ([...todo, ...blocked].some((i) => i.confidence === 'inferred')) out.push('', '_할 일·주의 항목은 출처를 바탕으로 에이전트가 판단한 내용입니다._');
  return out.join('\n');
}

/** Plain text for pasting into Notion/GitHub (Markdown, full report) or Slack (short update). */
export function exportReport(report: WeeklyWorkReport, o: ExportOptions): string {
  if (o.format === 'slack') return slackUpdate(report, o);
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const lines: string[] = [];
  const h = (t: string, level: 1 | 2) => `${level === 1 ? '#' : '##'} ${t}`;
  lines.push(h(o.title, 1));
  lines.push(`${periodKo(report.period)}${report.mode === 'demo' ? ' · 샘플 데이터' : ''}`);
  for (const sec of report.sections) {
    const items = sec.items.filter((i) => !o.hidden.has(i.id));
    if (!items.length) continue;
    lines.push('', h(sectionTitle(sec.id, o.prompt), 2));
    for (const i of items) {
      const cites = i.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s)).slice(0, 3);
      const refs = cites.map((s) => (s.url && report.mode !== 'demo' ? `[${chip(s)}](${s.url})` : chip(s)));
      const more = i.sources.length > 3 ? ` 외 ${i.sources.length - 3}건` : '';
      const tag = i.priority ? `[${PRIORITY_KO[i.priority]}] ` : '';
      const mark = i.confidence === 'inferred' ? ' _(추론)_' : '';
      const why = i.reason ? ` — 근거: ${i.reason}` : '';
      lines.push(`- ${tag}${i.text}${mark}${why}${refs.length ? ` (${refs.join(', ')}${more})` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Clipboard write with a selection fallback for browsers that refuse the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
