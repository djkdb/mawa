import { useEffect, useState } from 'react';
import { PROJECT } from '@mawa/shared';
import { ActivityTimeline } from './components/ActivityTimeline.js';
import { ArchitectureCta } from './components/ArchitectureCta.js';
import { Header } from './components/Header.js';
import { McpConnections } from './components/McpConnections.js';
import { PromptPanel } from './components/PromptPanel.js';
import { ReportView } from './components/ReportView.js';
import { SourcesPanel } from './components/SourcesPanel.js';
import { IS_DEMO_BUILD, getClient, type Status } from './lib/client.js';
import { useAgentRun } from './lib/useAgentRun.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, run, reset, busy } = useAgentRun();
  const finished = state.phase === 'completed' || state.phase === 'error';

  const refresh = () => getClient().getStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));

  useEffect(() => {
    void refresh();
    if (IS_DEMO_BUILD) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice(`${q.get('connected')} connected.`);
    if (q.get('auth_error')) setNotice(`Connection failed: ${q.get('auth_error')}`);
    if (q.has('connected') || q.has('auth_error')) window.history.replaceState({}, '', '/');
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Header status={status} />

      {IS_DEMO_BUILD && (
        <p role="note" className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-amber-200">
          Demo mode · synthetic data · recorded MCP run — nothing on this page contacts GitHub, Gmail, Calendar or an LLM.
        </p>
      )}
      {statusError && !IS_DEMO_BUILD && (
        <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          Cannot reach the API ({statusError}). Start it with <code className="font-mono">npm run dev</code>, or open the browser-only demo build.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200">
          {notice} <button type="button" className="ml-2 text-fog underline" onClick={() => setNotice(null)}>dismiss</button>
        </p>
      )}

      <section className="pt-2 sm:pt-4">
        <p className="eyebrow !text-accent">AI × MCP × AX</p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
          {PROJECT.tagline[0]} {PROJECT.tagline[1]} <span className="text-fog">{PROJECT.tagline[2]}</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fog sm:text-base">{PROJECT.descriptionKo}</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <PromptPanel status={status} busy={busy} finished={finished} onRun={run} onReset={reset} />
          <ActivityTimeline events={state.events} phase={state.phase} />
          {state.error && state.phase === 'error' && (
            <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{state.error}</p>
          )}
          {state.report && <ReportView report={state.report} warnings={state.warnings} />}
          {state.report && <SourcesPanel report={state.report} />}
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <McpConnections status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} />
        </aside>
      </div>

      <ArchitectureCta />

      <footer className="mt-auto border-t border-line/70 pt-4 font-mono text-[10px] text-fog">
        {PROJECT.name} · AI × MCP × AX · a personal learning project by {PROJECT.author.name} · <a href={PROJECT.author.instagram.url} target="_blank" rel="noreferrer" className="hover:text-white">{PROJECT.author.instagram.handle}</a>
      </footer>
    </main>
  );
}
