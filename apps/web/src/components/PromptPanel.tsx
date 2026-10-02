import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { PROJECT, type AgentMode } from '@mawa/shared';
import type { Status } from '../lib/api.js';
import type { RunPhase } from '../lib/useAgentRun.js';

const SUGGESTIONS = [PROJECT.samplePrompt, 'Summarize my GitHub activity and open issues this week.', '이번 주 일정과 관련 이메일을 정리해줘.'];

export function PromptPanel({ status, phase, onRun, onReset }: { status: Status | null; phase: RunPhase; onRun: (prompt: string, mode: AgentMode) => void; onReset: () => void }) {
  const [prompt, setPrompt] = useState<string>(PROJECT.samplePrompt);
  const [mode, setMode] = useState<AgentMode>('demo');
  const busy = phase === 'starting' || phase === 'running';
  const realAvailable = status?.realMode.available ?? false;

  return (
    <section className="rounded-2xl border border-line/70 bg-panel/60 p-5 backdrop-blur">
      <label htmlFor="prompt" className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">
        Ask your workspace
      </label>
      <textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={busy}
        className="mt-3 w-full resize-none rounded-xl border border-line bg-ink/60 px-4 py-3 text-base text-white outline-none ring-accent/50 placeholder:text-fog/60 focus:ring-2 disabled:opacity-60"
        placeholder={PROJECT.samplePrompt}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setPrompt(s)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-xs text-fog transition hover:border-accent/60 hover:text-white disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Mode" className="flex rounded-lg border border-line p-0.5 font-mono text-xs">
          {(['demo', 'real'] as const).map((m) => {
            const disabled = m === 'real' && !realAvailable;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={busy || disabled}
                onClick={() => setMode(m)}
                title={disabled ? 'Connect GitHub or Google to enable real mode' : undefined}
                className={`rounded-md px-3 py-1.5 uppercase tracking-widest transition ${mode === m ? 'bg-accent-soft text-white' : 'text-fog hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {m}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onRun(prompt.trim(), mode)}
          disabled={busy || prompt.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> {busy ? 'Running…' : 'Run agent'}
        </button>
        {phase !== 'idle' && !busy && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 font-mono text-xs text-fog hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <span className="ml-auto text-xs text-fog">
          {mode === 'demo' ? 'Demo: synthetic fixtures through the real MCP pipeline.' : `Real: live data from ${status?.realMode.servers.join(', ')}.`}
        </span>
      </div>
    </section>
  );
}
