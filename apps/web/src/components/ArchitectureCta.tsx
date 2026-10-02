import { ArrowUpRight } from 'lucide-react';
import { PROJECT } from '@mawa/shared';
import { PORTFOLIO_URL, REPO_URL } from '../lib/client.js';

export function ArchitectureCta() {
  const links = [
    PORTFOLIO_URL ? { label: 'View architecture', href: `${PORTFOLIO_URL}/#architecture` } : null,
    PORTFOLIO_URL ? { label: 'Explore MCP', href: `${PORTFOLIO_URL}/#mcp` } : null,
    PORTFOLIO_URL ? { label: 'View portfolio', href: PORTFOLIO_URL } : null,
    { label: 'Source on GitHub', href: REPO_URL },
  ].filter((l): l is { label: string; href: string } => l !== null);
  return (
    <section aria-labelledby="arch-heading" className="panel p-5 sm:p-6">
      <h2 id="arch-heading" className="eyebrow !text-white">Architecture</h2>
      <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]">
        {PROJECT.pipeline.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className={step === 'MCP SERVERS' || step === 'AI AGENT' ? 'text-accent' : 'text-slate-300'}>{step}</span>
            {i < PROJECT.pipeline.length - 1 && <span className="text-fog/50" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fog">
        Three MCP servers (official SDK, stdio) expose ten tools. The agent discovers them at runtime, the model chooses which to call, results are normalized into sources, and the report is validated so it can only cite ids that exist. The same pipeline runs on synthetic fixtures (demo) or live OAuth-connected data (real).
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target={l.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-slate-200 transition hover:border-accent/60 hover:text-white">
            {l.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        ))}
      </div>
    </section>
  );
}
