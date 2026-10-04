import { useEffect, useState } from 'react';
import { BookOpen, Check, CircleDashed, Eye, Loader2, Play, Plug, Sparkles, X } from 'lucide-react';
import type { AgentMode } from '@mawa/shared';
import { IS_DEMO_BUILD, REPO_URL, getClient, type Status } from '../lib/client.js';
import { friendlyError } from '../lib/friendly-error.js';
import { hrefFor } from '../lib/useHashRoute.js';
import type { AgentRunState } from '../lib/useAgentRun.js';

/**
 * First-visit guide. Demo: three steps to see what the service does (run → watch → read).
 * Real (API server): a readiness checklist that checks instead of assuming — is the model reachable
 * (one tiny request), is a source connected, has a run happened — with the one button for each.
 * Progress is a per-browser convenience; the guide renders fine without storage.
 */
const KEY = 'mawa.guide';
type Seen = { run?: boolean; office?: boolean; report?: boolean; dismissed?: boolean };
const load = (): Seen => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen; } catch { return {}; } };
const save = (s: Seen) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

const TERMS: Array<[string, string]> = [
  ['MCP 서버', '앱(GitHub·메일·캘린더·eCampus)마다 붙는 연결 프로그램. 사무실의 "담당자"입니다.'],
  ['출처', '리포트 문장마다 붙는 근거 — 실제로 읽어 온 메일·커밋·일정 원본. 눌러서 확인할 수 있어요.'],
  ['가림', 'AI에 보내기 전에 지운 메일 주소·전화번호·학번 같은 개인정보.'],
];

function Step({ n, done, title, body, children }: { n: number; done: boolean; title: string; body: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-text-2'}`} aria-hidden>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}{done && <span className="sr-only"> (완료)</span>}</p>
        <p className="text-[13px] leading-relaxed text-text-2">{body}</p>
        {children && <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </li>
  );
}

const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium';

export function GettingStarted({ status, state, busy, onRun, demoPrompt, realPrompt }: { status: Status | null; state: AgentRunState; busy: boolean; onRun: (p: string, m: AgentMode) => void; demoPrompt: string | undefined; realPrompt: string }) {
  const [seen, setSeen] = useState<Seen>(load);
  const mark = (k: keyof Seen) => setSeen((s) => { const n = { ...s, [k]: true }; save(n); return n; });
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'fail'; text?: string }>({ state: 'idle' });
  const real = !IS_DEMO_BUILD && status?.defaultMode === 'real';
  // A run that was started here counts as "tried it".
  useEffect(() => { if (state.startedAt && !seen.run) mark('run'); }, [state.startedAt]);
  const ranReal = state.mode === 'real' && state.phase === 'completed';

  if (seen.dismissed && (!real || ranReal || seen.report)) return null;
  const dismiss = () => mark('dismissed');

  const checkAi = async () => {
    const c = getClient();
    if (!c.checkLlm) return;
    setCheck({ state: 'checking' });
    try {
      const r = await c.checkLlm();
      setCheck(r.ok ? { state: 'ok', text: `준비됨 · ${r.provider}/${r.model}` } : { state: 'fail', text: `${friendlyError(r.error).title} — ${friendlyError(r.error).fix}` });
    } catch (e) {
      setCheck({ state: 'fail', text: friendlyError(e instanceof Error ? e.message : String(e)).fix });
    }
  };
  const scrollToOffice = () => { mark('office'); document.getElementById('office-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <section aria-labelledby="guide-heading" className="surface relative p-4 sm:p-5">
      <button type="button" onClick={dismiss} aria-label="시작 가이드 닫기" className="absolute right-2 top-2 rounded-md p-2 text-text-3 hover:bg-surface-2 hover:text-text"><X className="h-4 w-4" aria-hidden /></button>
      <h2 id="guide-heading" className="flex items-center gap-2 pr-8 text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-accent" aria-hidden />{real ? '내 계정으로 시작하기' : '처음이세요? 1분이면 둘러볼 수 있어요'}</h2>
      <p className="mt-0.5 text-[13px] text-text-3">{real ? '세 가지가 준비되면 이번 주 정리를 바로 실행할 수 있어요. 각 단계는 실제로 확인한 결과입니다.' : '세 단계만 따라 해 보세요. 진행하면 단계마다 체크가 켜지고, 다 보면 이 안내는 접어 둘 수 있어요.'}</p>

      {real ? (
        <ol className="mt-3 space-y-3">
          <Step n={1} done={check.state === 'ok' || !status?.llm.isModel} title="AI 준비" body={status?.llm.isModel ? `${status.llm.provider} 를 씁니다. 실행 전에 로그인·키가 살아 있는지 짧게 확인해 보세요.` : 'AI 모델 없이 규칙으로 정리합니다. 모델이 도구를 고르게 하려면 .env에 LLM_PROVIDER=claude-cli 를 넣고 서버를 다시 켜세요.'}>
            {status?.llm.isModel && <button type="button" onClick={() => void checkAi()} disabled={check.state === 'checking'} className={`${btn} hairline text-text-2 hover:text-text disabled:opacity-60`}>{check.state === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}{check.state === 'checking' ? '확인 중… (최대 1분)' : 'AI 연결 확인'}</button>}
            {check.text && <span role="status" className={`text-[13px] ${check.state === 'ok' ? 'text-ok' : 'text-danger'}`}>{check.text}</span>}
          </Step>
          <Step n={2} done={status?.realMode.available ?? false} title="서비스 연결" body={status?.realMode.available ? `연결됨: ${status.realMode.servers.join(', ')}. 읽기만 하고, 토큰은 서버에만 저장됩니다.` : 'GitHub(읽기 전용)부터 연결하세요. 메일·캘린더·eCampus는 나중에 더해도 됩니다.'}>
            {!status?.realMode.available && <a href={hrefFor('connections')} className={`${btn} bg-accent-strong text-on-accent hover:brightness-110`}><Plug className="h-3.5 w-3.5" aria-hidden />연결하러 가기</a>}
          </Step>
          <Step n={3} done={ranReal} title="첫 정리 실행" body="이번 주 활동을 모아 할 일·마감·막힌 것을 정리합니다. 1~2분 걸리고, 사무실 화면에서 진행을 볼 수 있어요.">
            <button type="button" disabled={busy || !status?.realMode.available} onClick={() => onRun(realPrompt, 'real')} className={`${btn} bg-accent-strong text-on-accent hover:brightness-110 disabled:opacity-50`}><Play className="h-3.5 w-3.5" aria-hidden />{busy ? '실행 중…' : '이번 주 정리 실행'}</button>
          </Step>
        </ol>
      ) : (
        <ol className="mt-3 space-y-3">
          <Step n={1} done={Boolean(seen.run)} title="샘플로 실행해 보기" body="버튼 하나로 약 10초. 실제 계정에는 접속하지 않습니다.">
            {demoPrompt && <button type="button" disabled={busy} onClick={() => onRun(demoPrompt, 'demo')} className={`${btn} bg-accent-strong text-on-accent hover:brightness-110 disabled:opacity-50`}><Play className="h-3.5 w-3.5" aria-hidden />{busy ? '실행 중…' : '실행해 보기'}</button>}
          </Step>
          <Step n={2} done={Boolean(seen.office)} title="사무실에서 지켜보기" body="비서가 앱마다 있는 담당자에게 자료를 받아 오고, 보안 담당이 개인정보를 가린 뒤 AI에게 넘기는 모습이 그대로 보입니다.">
            <button type="button" onClick={scrollToOffice} className={`${btn} hairline text-text-2 hover:text-text`}><Eye className="h-3.5 w-3.5" aria-hidden />사무실 보기</button>
          </Step>
          <Step n={3} done={Boolean(seen.report)} title="근거와 함께 읽기" body="리포트의 문장마다 붙은 칩을 누르면 원본 메일·커밋이 보여요. 슬랙용 짧은 요약도 복사할 수 있습니다.">
            <a href={hrefFor('report', state.runId)} onClick={() => mark('report')} className={`${btn} hairline text-text-2 hover:text-text`}><BookOpen className="h-3.5 w-3.5" aria-hidden />리포트 열기</a>
          </Step>
        </ol>
      )}

      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-text-2 hover:text-text">자주 나오는 말 3개</summary>
        <dl className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {TERMS.map(([t, d]) => <div key={t} className="rounded-md bg-surface-2 px-3 py-2"><dt className="font-semibold text-text">{t}</dt><dd className="text-text-2">{d}</dd></div>)}
        </dl>
      </details>
      {!real && <p className="mt-2 text-[13px] text-text-3">내 계정으로 쓰고 싶다면: <a href={`${REPO_URL}/blob/${(import.meta.env['VITE_REPO_REF'] as string | undefined) ?? 'HEAD'}/docs/REAL_RUN.md`} target="_blank" rel="noreferrer" className="text-accent hover:underline">설치·연결 안내</a> (내 PC에서 실행, 읽기 전용)</p>}
    </section>
  );
}
