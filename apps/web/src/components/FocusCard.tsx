import { ArrowRight, Target } from 'lucide-react';
import type { ReportItem, WeeklyWorkReport } from '@mawa/shared';
import { categoryOf } from '../lib/copy.js';
import { categoryIcon } from '../lib/icons.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { ItemText, ddayOf } from './ItemText.js';

const rank = { high: 0, medium: 1, low: 2 } as const;
const days = (d: string | null) => (d === '오늘' ? 0 : d === '내일' ? 1 : d?.startsWith('D-') ? Number(d.slice(2)) : 99);

/**
 * "먼저 챙길 것": the three actions to start with — by priority, then by the nearest D-day.
 * One glance answers "what needs my attention now" before the category board.
 */
export function FocusCard({ report, runId }: { report: WeeklyWorkReport; runId: string | null }) {
  const ref = new Date(report.generatedAt).getTime();
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const actions = report.sections.find((s) => s.id === 'next_actions')?.items ?? [];
  const top = [...actions]
    .map((item) => ({ item, d: days(ddayOf(item, byId, ref)) }))
    .sort((a, b) => rank[a.item.priority ?? 'low'] - rank[b.item.priority ?? 'low'] || a.d - b.d)
    .slice(0, 3)
    .map((x) => x.item);
  if (!top.length) return null;
  const high = actions.filter((i) => i.priority === 'high').length;

  return (
    <section aria-labelledby="focus-heading" className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Target className="h-[18px] w-[18px] text-accent" aria-hidden />
        <h3 id="focus-heading" className="text-[17px] font-semibold">먼저 챙길 것</h3>
        <span className="tnum text-sm text-text-3">할 일 {actions.length}개 중{high ? ` · 높음 ${high}개` : ''}</span>
        <a href={hrefFor('report', runId)} className="ml-auto inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent hover:underline">할 일 전체 <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
      </div>
      <ol className="mt-2 divide-y divide-line/70">
        {top.map((item: ReportItem, i) => {
          const c = categoryOf(item.category);
          const Icon = categoryIcon(item.category);
          return (
            <li key={item.id} className="flex min-w-0 gap-3 py-3 first:pt-2 last:pb-0">
              <span className="tnum mt-0.5 w-5 shrink-0 text-right text-sm font-semibold text-text-3">{i + 1}</span>
              <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
                <div className="mb-1.5 flex shrink-0 items-center gap-1.5 sm:order-2 sm:mb-0 sm:ml-auto">
                  <span className="inline-flex items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-[18px]" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}><Icon className="h-3 w-3" aria-hidden />{c.label}</span>
                  {item.priority && <span className={`pri pri-${item.priority}`}>{item.priority === 'high' ? '높음' : item.priority === 'medium' ? '보통' : '낮음'}</span>}
                </div>
                <div className="min-w-0 flex-1"><ItemText item={item} byId={byId} refTime={ref} action /></div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
