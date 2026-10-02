import { useEffect, useState } from 'react';
import { ReportView } from './components/ReportView.js';
import { Shell } from './components/Shell.js';
import { IS_DEMO_BUILD, getClient, type Status } from './lib/client.js';
import { useAgentRun } from './lib/useAgentRun.js';
import { useHashRoute } from './lib/useHashRoute.js';
import { ConnectionsPage } from './pages/ConnectionsPage.js';
import { HomePage } from './pages/HomePage.js';
import { RunsPage } from './pages/RunsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { route, navigate } = useHashRoute();
  const { state, run, showRecorded, openRun, busy } = useAgentRun();
  const refresh = () => getClient().getStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));

  useEffect(() => {
    void refresh();
    if (IS_DEMO_BUILD) { showRecorded(); return; }
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice(`${q.get('connected')} 연결됨`);
    if (q.get('auth_error')) setNotice(`연결 실패: ${q.get('auth_error')}`);
    if (q.has('connected') || q.has('auth_error')) window.history.replaceState({}, '', `/${window.location.hash}`);
  }, [showRecorded]);

  const startRun: typeof run = (p, m) => { navigate('home'); return run(p, m); };
  const recorded = IS_DEMO_BUILD && (state.runId?.startsWith('recorded_') ?? false);

  return (
    <Shell route={route} navigate={navigate} status={status}>
      {statusError && !IS_DEMO_BUILD && (
        <p role="alert" className="mx-auto mb-4 max-w-5xl rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">API 서버에 연결할 수 없습니다 ({statusError}). <code className="font-mono">npm run dev</code>로 실행하거나 데모 빌드를 여세요.</p>
      )}
      {notice && <p role="status" className="surface mx-auto mb-4 max-w-5xl px-4 py-3 text-sm">{notice} <button type="button" className="ml-2 text-text-2 underline" onClick={() => setNotice(null)}>닫기</button></p>}

      {route === 'home' && <HomePage status={status} state={state} busy={busy} onRun={startRun} onOpenReport={() => navigate('report')} />}
      {route === 'report' && (
        <div className="mx-auto max-w-5xl">
          {state.report ? <ReportView report={state.report} warnings={state.warnings} recorded={recorded} /> : (
            <div className="surface p-8 text-center text-sm text-text-2">아직 리포트가 없습니다. <button type="button" onClick={() => navigate('home')} className="text-accent hover:underline">홈에서 질문을 골라 실행</button>하세요.</div>
          )}
        </div>
      )}
      {route === 'runs' && <RunsPage currentRunId={state.runId} refreshKey={state.events.length + (state.runId?.length ?? 0)} onOpen={(id) => { void openRun(id).then(() => navigate('report')); }} />}
      {route === 'connections' && <ConnectionsPage status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} />}
      {route === 'settings' && <SettingsPage status={status} />}
    </Shell>
  );
}
