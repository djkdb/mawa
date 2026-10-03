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

/** Plain text for pasting into Notion/GitHub (Markdown) or Slack (mrkdwn). Citations become short labels or links. */
export function exportReport(report: WeeklyWorkReport, o: ExportOptions): string {
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const lines: string[] = [];
  const h = (t: string, level: 1 | 2) => (o.format === 'slack' ? `*${t}*` : `${level === 1 ? '#' : '##'} ${t}`);
  lines.push(h(o.title, 1));
  lines.push(`${periodKo(report.period)}${report.mode === 'demo' ? ' · 샘플 데이터' : ''}`);
  for (const sec of report.sections) {
    const items = sec.items.filter((i) => !o.hidden.has(i.id));
    if (!items.length) continue;
    lines.push('', h(sectionTitle(sec.id, o.prompt), 2));
    for (const i of items) {
      const cites = i.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s)).slice(0, 3);
      const refs = cites.map((s) => (o.format === 'markdown' && s.url && report.mode !== 'demo' ? `[${chip(s)}](${s.url})` : chip(s)));
      const more = i.sources.length > 3 ? ` 외 ${i.sources.length - 3}건` : '';
      const tag = i.priority ? `[${PRIORITY_KO[i.priority]}] ` : '';
      const mark = i.confidence === 'inferred' ? ' _(추론)_' : '';
      lines.push(`${o.format === 'slack' ? '•' : '-'} ${tag}${i.text}${mark}${refs.length ? ` (${refs.join(', ')}${more})` : ''}`);
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
