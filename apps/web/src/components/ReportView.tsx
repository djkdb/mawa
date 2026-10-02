import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import type { Source, WeeklyWorkReport } from '@mawa/shared';
import { ModeBadge } from './ModeBadge.js';

const SOURCE_LABEL: Record<Source['type'], string> = { github: 'GitHub', gmail: 'Gmail', calendar: 'Google Calendar' };

export function ReportView({ report, warnings }: { report: WeeklyWorkReport; warnings: string[] }) {
  const sources = new Map(report.sources.map((s) => [s.id, s]));
  const [open, setOpen] = useState<string | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line/70 bg-panel/60 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{report.title}</h2>
          <p className="mt-1 font-mono text-[11px] text-fog">
            {fmt(report.period.start)} – {fmt(report.period.end)} · {report.sources.length} sources · generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <ModeBadge mode={report.mode} size="md" />
      </header>

      {report.mode === 'demo' && (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          This report was built from synthetic demo fixtures served by the MCP servers in demo mode. It is not your data.
        </p>
      )}

      <div className="mt-4 flex gap-4 font-mono text-[11px] text-fog">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-300" />observed: supported by cited sources</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300" />inferred: the agent's interpretation</span>
      </div>

      {report.sections.map((section) => (
        <section key={section.id} className="mt-6">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">{section.title}</h3>
          <ul className="mt-2 space-y-2">
            {section.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-line/50 bg-ink/40 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.confidence === 'observed' ? 'bg-emerald-300' : 'bg-violet-300'}`} title={item.confidence} />
                  <p className="text-sm leading-relaxed text-slate-200">{item.text}</p>
                </div>
                {item.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-4">
                    {item.sources.map((id) => {
                      const s = sources.get(id);
                      if (!s) return null;
                      const isOpen = open === `${item.id}:${id}`;
                      return (
                        <span key={id} className="relative">
                          <button
                            type="button"
                            onClick={() => setOpen(isOpen ? null : `${item.id}:${id}`)}
                            className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fog hover:border-accent/60 hover:text-white"
                            aria-expanded={isOpen}
                          >
                            Source: {SOURCE_LABEL[s.type]}
                          </button>
                          {isOpen && (
                            <span className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-line bg-navy p-2 text-xs shadow-xl">
                              <span className="block text-white">{s.title}</span>
                              <span className="block font-mono text-[10px] text-fog">{s.id}</span>
                              {s.url && (
                                <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent hover:underline">
                                  open <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </span>
                          )}
                        </span>
                      );
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
