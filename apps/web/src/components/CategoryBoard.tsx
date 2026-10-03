import { AlertTriangle, ArrowRight, CalendarDays, CheckSquare, NotebookPen } from 'lucide-react';
import type { ReportItem, WeeklyWorkReport } from '@mawa/shared';
import { categoriesFor, PRIORITY_KO } from '../lib/copy.js';
import { categoryIcon } from '../lib/icons.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { ItemText } from './ItemText.js';

type Entry = { item: ReportItem; kind: '할 일' | '주의' | '일정' | '기록' };
const rank = { high: 0, medium: 1, low: 2 } as const;
const KIND: Record<Entry['kind'], { Icon: typeof CheckSquare; cls: string }> = {
  '할 일': { Icon: CheckSquare, cls: 'text-accent' },
  주의: { Icon: AlertTriangle, cls: 'text-warn' },
  일정: { Icon: CalendarDays, cls: 'text-calendar' },
  기록: { Icon: NotebookPen, cls: 'text-text-3' },
};

/**
 * This week by category (수업·과제 / 팀플 / 개발 / 모임 / 취업 / …): what to do, what to watch,
 * and what is coming, each category on one card. One entry per underlying source, actions first.
 */
export function CategoryBoard({ report, runId }: { report: WeeklyWorkReport; runId: string | null }) {
  const ref = new Date(report.generatedAt).getTime();
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const sec = (id: string) => report.sections.find((s) => s.id === id)?.items ?? [];
  const future = (i: ReportItem) => i.sources.some((id) => { const s = byId.get(id); return s?.timestamp && new Date(s.timestamp).getTime() >= ref; });
  const groups = new Map<string, Entry[]>();
  const seen = new Set<string>();
  const add = (item: ReportItem, kind: Entry['kind']) => {
    const key = item.sources[0] ?? item.id;
    if (seen.has(key)) return;
    seen.add(key);
    const c = item.category ?? '기타';
    groups.set(c, [...(groups.get(c) ?? []), { item, kind }]);
  };
  [...sec('next_actions')].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']).forEach((i) => add(i, '할 일'));
  [...sec('potential_risks')].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']).forEach((i) => add(i, '주의'));
  sec('schedule').filter(future).forEach((i) => add(i, '일정'));
  sec('major_activities').forEach((i) => add(i, '기록'));
  const cats = categoriesFor().filter((c) => groups.has(c.key));
  if (!cats.length) return null;

  return (
    <section aria-labelledby="board-heading">
      <h3 id="board-heading" className="text-[15px] font-semibold">카테고리별 이번 주</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cats.map((c) => {
          const entries = groups.get(c.key)!;
          const Icon = categoryIcon(c.key);
          const count = (k: Entry['kind']) => entries.filter((e) => e.kind === k).length;
          const high = entries.filter((e) => e.item.priority === 'high').length;
          return (
            <section key={c.key} aria-label={c.label} className="surface flex flex-col p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: c.color }} aria-hidden />
                <h4 className="text-[15px] font-semibold text-text">{c.label}</h4>
                {high > 0 && <span className="pri pri-high">높음 {high}</span>}
                <span className="tnum ml-auto text-xs text-text-3">{[count('할 일') && `할 일 ${count('할 일')}`, count('주의') && `주의 ${count('주의')}`, count('일정') && `일정 ${count('일정')}`, count('기록') && `기록 ${count('기록')}`].filter(Boolean).join(' · ')}</span>
              </div>
              <ul className="mt-2 flex-1">
                {entries.slice(0, 3).map(({ item, kind }) => (
                  <li key={item.id} className="flex items-start gap-2.5 border-t border-line/60 py-2.5 first:border-t-0">
                    <span className={`mt-0.5 inline-flex w-12 shrink-0 items-center gap-1 text-[11px] font-semibold ${KIND[kind].cls}`}>{(() => { const K = KIND[kind].Icon; return <K className="h-3.5 w-3.5" aria-hidden />; })()}{kind}</span>
                    <ItemText item={item} byId={byId} refTime={ref} action={kind === '할 일'} compact />
                    {item.priority === 'high' && <span className="sr-only">{PRIORITY_KO.high}</span>}
                  </li>
                ))}
              </ul>
              <a href={hrefFor('report', runId, { cat: c.key })} className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent hover:underline">
                {entries.length > 3 ? `${entries.length - 3}개 더 · ` : ''}{c.label} 전체 보기 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </section>
          );
        })}
      </div>
    </section>
  );
}
