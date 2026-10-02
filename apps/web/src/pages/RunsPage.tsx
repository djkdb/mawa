import { useEffect, useState } from 'react';
import { getClient, type RunSummary } from '../lib/client.js';
import { EXAMPLE_META } from '../lib/copy.js';
import { DEMO_EXAMPLES } from '../lib/client.js';

function titleFor(prompt: string) {
  const ex = DEMO_EXAMPLES.find((e) => e.prompt === prompt);
  return ex ? (EXAMPLE_META[ex.id]?.title ?? prompt) : prompt;
}

export function RunsPage({ currentRunId, refreshKey, onOpen }: { currentRunId: string | null; refreshKey: number; onOpen: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getClient().listRuns().then(setRuns).catch((e: Error) => setError(e.message)); }, [refreshKey]);
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-4 text-sm text-text-2">에이전트가 실행한 리포트 목록입니다. 항목을 열면 리포트 화면으로 이동합니다.</p>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {runs && (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-3">
              <tr className="border-b border-line"><th className="px-4 py-2.5 font-medium">시간</th><th className="px-4 py-2.5 font-medium">질문</th><th className="hidden px-4 py-2.5 font-medium sm:table-cell">도구 호출</th><th className="hidden px-4 py-2.5 font-medium sm:table-cell">출처</th><th className="px-4 py-2.5 font-medium">상태</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId} className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2 ${r.runId === currentRunId ? 'bg-surface-2' : ''}`} onClick={() => onOpen(r.runId)}>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-text-2">{new Date(r.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3"><button type="button" className="text-left font-medium text-text hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(r.runId); }}>{titleFor(r.prompt)}</button>{r.recorded && <span className="ml-2 text-xs text-text-3">기록</span>}</td>
                  <td className="tnum hidden px-4 py-3 text-text-2 sm:table-cell">{r.toolCalls}회</td>
                  <td className="tnum hidden px-4 py-3 text-text-2 sm:table-cell">{r.sources}건</td>
                  <td className="px-4 py-3"><span className={`tag ${r.status === 'success' ? 'bg-ok/15 text-emerald-200' : r.status === 'running' ? 'bg-accent-2 text-text' : 'bg-rose-400/15 text-rose-200'}`}>{r.status === 'success' ? '완료' : r.status === 'running' ? '실행 중' : '실패'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
