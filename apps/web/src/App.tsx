import { useEffect, useRef, useState } from 'react';
import { ActivityTimeline } from './components/ActivityTimeline.js';
import { ReportView } from './components/ReportView.js';
import { Shell } from './components/Shell.js';
import { IS_DEMO_BUILD, getClient, type Status } from './lib/client.js';
import { useAgentRun } from './lib/useAgentRun.js';
import { hrefFor, useHashRoute } from './lib/useHashRoute.js';
import { ConnectionsPage } from './pages/ConnectionsPage.js';
import { HomePage } from './pages/HomePage.js';
import { RunsPage } from './pages/RunsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const { route, param, navigate } = useHashRoute();
  const { state, run, showRecorded, openRun, busy } = useAgentRun();
  const refresh = () => getClient().getStatus().then(setStatus).catch((e: Error) => setStatusError(e.message));
  const requested = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
    // A deep link to a specific run wins over the default recorded run.
    if (IS_DEMO_BUILD && !(route === 'report' && param)) showRecorded();
    if (IS_DEMO_BUILD) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice(`${q.get('connected')} 연결됨`);
    if (q.get('auth_error')) setNotice(`연결 실패: ${q.get('auth_error')}`);
    if (q.has('connected') || q.has('auth_error')) window.history.replaceState({}, '', `/${window.location.hash}`);
  }, [showRecorded]);

  // #/report/<runId>: load that run once per requested id (ids may normalise, e.g. a reloaded replay → its recording).
  useEffect(() => {
    if (route !== 'report' || !param || param === state.runId || requested.current === param) return;
    requested.current = param;
    void openRun(param);
  }, [route, param, state.runId, openRun]);

  // Screen-reader announcements for run progress.
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const p = prevPhase.current;
    if (state.phase === 'starting' && p !== 'starting') setAnnounce('에이전트 실행을 시작했습니다.');
    if (state.phase === 'completed' && p !== 'completed' && p !== 'idle') {
      const calls = state.events.filter((e) => e.type === 'tool_call_completed').length;
      setAnnounce(`리포트가 완성되었습니다. 도구 ${calls}회 호출.`);
    }
    if (state.phase === 'error' && p !== 'error') setAnnounce(`실행에 실패했습니다. ${state.error ?? ''}`);
    prevPhase.current = state.phase;
  }, [state.phase, state.events, state.error]);

  const startRun: typeof run = (p, m) => { if (route !== 'home') navigate('home'); return run(p, m); };
  const reportHref = hrefFor('report', state.runId);
  const recorded = IS_DEMO_BUILD;

  return (
    <Shell route={route} reportHref={reportHref} navigate={(r) => navigate(r)} status={status}>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
      {statusError && !IS_DEMO_BUILD && (
        <p role="alert" className="mx-auto mb-4 max-w-5xl rounded-lg bg-rose-400/10 px-4 py-3 text-sm text-rose-200">API 서버에 연결할 수 없습니다 ({statusError}). <code className="font-mono">npm run dev</code>로 실행하거나 데모 빌드를 여세요.</p>
      )}
      {notice && <p role="status" className="surface mx-auto mb-4 max-w-5xl px-4 py-3 text-sm">{notice} <button type="button" className="ml-2 text-text-2 underline" onClick={() => setNotice(null)}>닫기</button></p>}

      {route === 'home' && <HomePage status={status} state={state} busy={busy} onRun={startRun} reportHref={reportHref} />}
      {route === 'report' && (
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {state.report ? (
            <>
              <ReportView key={state.runId ?? 'none'} report={state.report} warnings={state.warnings} recorded={recorded} prompt={state.prompt} onAnnounce={setAnnounce} />
              <ActivityTimeline events={state.events} phase={state.phase} recorded={recorded} runId={state.runId} />
            </>
          ) : state.phase === 'error' ? (
            <div className="surface p-8 text-center text-sm text-text-2">{state.error} <a href={hrefFor('runs')} className="text-accent hover:underline">실행 기록 보기</a></div>
          ) : busy ? (
            <div className="surface p-8 text-center text-sm text-text-2">리포트를 만드는 중입니다. <a href={hrefFor('home')} className="text-accent hover:underline">홈에서 진행 상황 보기</a></div>
          ) : (
            <div className="surface p-8 text-center text-sm text-text-2">아직 리포트가 없습니다. <a href={hrefFor('home')} className="text-accent hover:underline">홈에서 질문을 골라 실행</a>하세요.</div>
          )}
        </div>
      )}
      {route === 'runs' && <RunsPage currentRunId={state.runId} refreshKey={state.events.length + (state.runId?.length ?? 0) + (state.phase === 'completed' ? 1 : 0)} />}
      {route === 'connections' && <ConnectionsPage status={status} events={state.events} onDisconnect={(p) => getClient().disconnect(p).then(refresh)} />}
      {route === 'settings' && <SettingsPage status={status} />}
    </Shell>
  );
}
