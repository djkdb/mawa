import { PROJECT } from '@mawa/shared';

export function Pipeline() {
  return (
    <section className="rounded-2xl border border-line/70 bg-panel/60 p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">Architecture</h2>
      <ol className="mt-3 space-y-1 font-mono text-[11px]">
        {PROJECT.pipeline.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="w-4 text-fog/60">{i + 1}</span>
            <span className={step === 'MCP SERVERS' || step === 'AI AGENT' ? 'text-accent' : 'text-slate-300'}>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] leading-relaxed text-fog">
        Three MCP servers (official SDK, stdio) are spawned per run. The agent discovers their tools at runtime and only the tool calls it makes are shown here. Model reasoning is never displayed.
      </p>
    </section>
  );
}
