import { useEffect, useState } from 'react';
import { exampleOf, getClient, recordedIdOf, recordedPersona, type RunSummary } from '../lib/client.js';
import { persona } from '../lib/persona.js';
import { EXAMPLE_META, SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';
import { hrefFor } from '../lib/useHashRoute.js';

function titleFor(prompt: string, kind?: string, runId?: string) {
  if (kind === 'validation') return '출처 검증 시연';
  if (kind === 'policy') return `${runId?.includes('worker') ? '주간 보고' : '이번 주 정리'} · ${runId?.endsWith('policy-strict') ? '엄격한 정책' : '정책 없음'}`;
  const ex = exampleOf(prompt);
  const base = ex ? (EXAMPLE_META[ex.id]?.title ?? prompt) : prompt;
  return kind === 'llm' ? `${base} — AI가 고른 도구로` : base;
}

export function RunsPage({ currentRunId, refreshKey }: { currentRunId: string | null; refreshKey: number }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Demo: the active persona's runs only (the admin sees the worker's company).
  const mine = (r: RunSummary) => { const id = recordedIdOf(r.runId); const owner = id ? recordedPersona(id) : null; return !owner || owner === persona().data; };
  useEffect(() => { getClient().listRuns().then((l) => setRuns(l.filter(mine))).catch((e: Error) => setError(e.message)); }, [refreshKey]);
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-4 text-sm text-text-2">에이전트가 만든 리포트 목록입니다. 질문을 누르면 그 실행의 리포트와 활동 기록을 엽니다.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {runs && (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">실행 기록: 시간, 질문, 호출한 소스, 도구 호출 수, 출처 수, 상태</caption>
            <thead className="text-left text-xs text-text-3">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">시간</th>
                <th scope="col" className="px-4 py-2.5 font-medium">질문</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">호출한 소스</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">도구 호출</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">출처</th>
                <th scope="col" className="px-4 py-2.5 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId} className={`border-b border-line/60 last:border-0 hover:bg-surface-2 ${r.runId === currentRunId ? 'bg-surface-2' : ''}`}>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-text-2">{new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3">
                    <a href={hrefFor('report', r.runId)} className="font-medium text-text hover:underline">{titleFor(r.prompt, r.kind, r.runId)}</a>
                    {r.kind === 'llm' ? <span className="ml-2 rounded bg-accent-2 px-1.5 py-0.5 text-[11px] text-text">실제 LLM 기록{r.model ? ` · ${r.model}` : ''}</span> : r.kind === 'policy' ? <span className="ml-2 rounded bg-ok/15 px-1.5 py-0.5 text-[11px] text-ok">정책 시연</span> : r.kind === 'validation' ? <span className="ml-2 rounded bg-inferred/15 px-1.5 py-0.5 text-[11px] text-inferred">검증 시연 · 가짜 출처 주입</span> : r.recorded ? <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-3">샘플 기록</span> : null}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-2">
                      {r.servers.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: SERVER_COLOR[s] }} aria-hidden />{SERVER_NAME[s]}</span>)}
                    </span>
                  </td>
                  <td className="tnum hidden px-4 py-3 text-text-2 sm:table-cell">{r.toolCalls}회</td>
                  <td className="tnum hidden px-4 py-3 text-text-2 sm:table-cell">{r.sources}건</td>
                  <td className="px-4 py-3"><span className={`tag ${r.status === 'success' ? 'bg-ok/15 text-ok' : r.status === 'running' ? 'bg-accent-2 text-text' : 'bg-danger/15 text-danger'}`}>{r.status === 'success' ? '완료' : r.status === 'running' ? '실행 중' : '실패'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
