import { motion, useReducedMotion } from 'framer-motion';
import type { WeeklyWorkReport } from '@mawa/shared';
import { IS_DEMO_BUILD } from '../lib/client.js';
import { ModeBadge } from './ModeBadge.js';
import { SourceChip } from './SourceChip.js';

export function ReportView({ report, warnings }: { report: WeeklyWorkReport; warnings: string[] }) {
  const reduced = useReducedMotion();
  const sources = new Map(report.sources.map((s) => [s.id, s]));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const total = report.sections.reduce((n, s) => n + s.items.length, 0);
  const observed = report.sections.reduce((n, s) => n + s.items.filter((i) => i.confidence === 'observed').length, 0);

  return (
    <motion.article aria-labelledby="report-heading" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 pb-4">
        <div>
          <h2 id="report-heading" className="text-xl font-semibold text-white">{report.title}</h2>
          <p className="mt-1 font-mono text-[11px] text-fog">
            {fmt(report.period.start)} – {fmt(report.period.end)} · {report.sources.length} sources · {observed}/{total} items observed
          </p>
        </div>
        <ModeBadge mode={report.mode} size="md" />
      </header>

      {report.mode === 'demo' && (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          {IS_DEMO_BUILD ? 'Recorded MCP run replayed in the browser. ' : ''}Built from synthetic demo fixtures served by the MCP servers in demo mode. Not your data.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fog">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-300" aria-hidden />observed: supported by cited sources</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300" aria-hidden />inferred: the agent's interpretation</span>
      </div>

      {report.sections.map((section) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`} className="mt-6">
          <h3 id={`sec-${section.id}`} className="eyebrow !text-accent">{section.title}</h3>
          <ul className="mt-2 space-y-2">
            {section.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-line/50 bg-ink/40 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.confidence === 'observed' ? 'bg-emerald-300' : 'bg-violet-300'}`} role="img" aria-label={item.confidence} />
                  <p className="text-sm leading-relaxed text-slate-200">{item.text}</p>
                </div>
                {item.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-4">
                    {item.sources.map((id) => {
                      const s = sources.get(id);
                      return s ? <SourceChip key={id} source={s} /> : null;
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {warnings.length > 0 && (
        <details className="mt-6 text-xs text-fog">
          <summary className="cursor-pointer font-mono uppercase tracking-widest">Run notes ({warnings.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
    </motion.article>
  );
}
