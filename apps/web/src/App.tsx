import { useEffect, useState } from 'react';
import { ActivityTimeline } from './components/ActivityTimeline.js';
import { Header } from './components/Header.js';
import { IntegrationsPanel } from './components/IntegrationsPanel.js';
import { Pipeline } from './components/Pipeline.js';
import { PromptPanel } from './components/PromptPanel.js';
import { ReportView } from './components/ReportView.js';
import { disconnect, fetchStatus, type Status } from './lib/api.js';
import { useAgentRun } from './lib/useAgentRun.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, run, reset } = useAgentRun();

  const refresh = () => fetchStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));

  useEffect(() => {
    void refresh();
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice(`${q.get('connected')} connected.`);
    if (q.get('auth_error')) setNotice(`Connection failed: ${q.get('auth_error')}`);
    if (q.has('connected') || q.has('auth_error')) window.history.replaceState({}, '', '/');
  }, []);

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Header status={status} />
      {statusError && (
        <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          Cannot reach the API ({statusError}). Start it with <code className="font-mono">npm run dev</code>.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200">
          {notice}{' '}
          <button type="button" className="ml-2 text-fog underline" onClick={() => setNotice(null)}>
            dismiss
          </button>
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-5">
          <PromptPanel status={status} phase={state.phase} onRun={run} onReset={reset} />
          <ActivityTimeline events={state.events} phase={state.phase} />
          {state.error && state.phase === 'error' && (
            <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{state.error}</p>
          )}
          {state.report && <ReportView report={state.report} warnings={state.warnings} />}
        </div>
        <aside className="flex flex-col gap-5">
          <IntegrationsPanel status={status} onDisconnect={(p) => disconnect(p).then(refresh)} />
          <Pipeline />
        </aside>
      </div>
      <footer className="mt-auto border-t border-line/70 pt-4 font-mono text-[10px] text-fog">
        My AI Work Agent · AI × MCP × AX · a personal learning project by Lee Seongjun
      </footer>
    </main>
  );
}
