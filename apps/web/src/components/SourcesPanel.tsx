import type { Source, WeeklyWorkReport } from '@mawa/shared';
import { SOURCE_LABEL, SourceChip } from './SourceChip.js';

/** Every source the report may cite, grouped by system. The id list is the whole universe of citations. */
export function SourcesPanel({ report }: { report: WeeklyWorkReport }) {
  const groups = new Map<Source['type'], Source[]>();
  for (const s of report.sources) groups.set(s.type, [...(groups.get(s.type) ?? []), s]);
  return (
    <section aria-labelledby="sources-heading" className="panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sources-heading" className="eyebrow !text-white">Sources</h2>
        <span className="font-mono text-[10px] text-fog">{report.sources.length} items · ids are the only citable universe</span>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {[...groups.entries()].map(([type, list]) => (
          <div key={type} className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{SOURCE_LABEL[type]} · {list.length}</div>
            <ul className="mt-2 space-y-1.5">
              {list.slice(0, 8).map((s) => (
                <li key={s.id} className="flex min-w-0 items-start gap-2 text-xs">
                  <span className="shrink-0"><SourceChip source={s} /></span>
                  <span className="min-w-0 truncate text-slate-300" title={s.title}>{s.title}</span>
                </li>
              ))}
              {list.length > 8 && <li className="font-mono text-[10px] text-fog">+{list.length - 8} more</li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
