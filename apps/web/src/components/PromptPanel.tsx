import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { PROJECT, type AgentMode } from '@mawa/shared';
import { DEMO_EXAMPLES, DEMO_RECORDED_AT, IS_DEMO_BUILD, type Status } from '../lib/client.js';

export function PromptPanel({ status, busy, finished, onRun, onReset }: { status: Status | null; busy: boolean; finished: boolean; onRun: (prompt: string, mode: AgentMode) => void; onReset: () => void }) {
  const [prompt, setPrompt] = useState<string>(DEMO_EXAMPLES[0]?.prompt ?? PROJECT.samplePrompt);
  const [mode, setMode] = useState<AgentMode>('demo');
  const realAvailable = !IS_DEMO_BUILD && (status?.realMode.available ?? false);

  return (
    <section aria-labelledby="ask-heading" className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ask-heading" className="text-lg font-semibold text-white sm:text-xl">Ask your workspace</h2>
        <span className="eyebrow">{IS_DEMO_BUILD ? 'Recorded MCP run · browser-only' : 'Agent run'}</span>
      </div>
      <p className="mt-1 text-sm text-fog">
        {IS_DEMO_BUILD
          ? 'This public demo replays runs recorded from the real agent and MCP pipeline over synthetic fixtures. Choose an example request.'
          : 'The agent discovers MCP tools, lets the model pick what it needs, and returns a report where every claim cites its source.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Example requests">
        {DEMO_EXAMPLES.map((ex) => {
          const active = ex.prompt === prompt;
          return (
            <button key={ex.id} type="button" onClick={() => setPrompt(ex.prompt)} disabled={busy} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-left text-xs transition disabled:opacity-50 ${active ? 'border-accent/70 bg-accent-soft text-white' : 'border-line text-fog hover:border-accent/50 hover:text-white'}`}>
              {ex.prompt}
            </button>
          );
        })}
      </div>

      <label htmlFor="prompt" className="sr-only">Request</label>
      <textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={busy}
        readOnly={IS_DEMO_BUILD}
        aria-describedby="prompt-help"
        className="mt-4 w-full resize-none rounded-xl border border-line bg-ink/60 px-4 py-3 text-base text-white outline-none placeholder:text-fog/60 disabled:opacity-60"
        placeholder={PROJECT.samplePrompt}
      />
      <p id="prompt-help" className="mt-1.5 text-[11px] text-fog">
        {IS_DEMO_BUILD ? `Free-form prompts need the API server. Recorded ${new Date(DEMO_RECORDED_AT).toLocaleDateString()}.` : 'Enter is a newline; use the button to run.'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!IS_DEMO_BUILD && (
          <div role="radiogroup" aria-label="Mode" className="flex rounded-lg border border-line p-0.5 font-mono text-xs">
            {(['demo', 'real'] as const).map((m) => {
              const disabled = m === 'real' && !realAvailable;
              return (
                <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy || disabled} onClick={() => setMode(m)} title={disabled ? 'Connect GitHub or Google to enable real mode' : undefined} className={`rounded-md px-3 py-1.5 uppercase tracking-widest transition ${mode === m ? 'bg-accent-soft text-white' : 'text-fog hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}>
                  {m}
                </button>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => onRun(prompt.trim(), mode)} disabled={busy || prompt.trim().length === 0} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          <Play className="h-3.5 w-3.5" aria-hidden /> {busy ? 'Running…' : IS_DEMO_BUILD ? 'Replay run' : 'Run agent'}
        </button>
        {finished && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 font-mono text-xs text-fog hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
          </button>
        )}
      </div>
    </section>
  );
}
