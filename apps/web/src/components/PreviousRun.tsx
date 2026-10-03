import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { WeeklyWorkReport } from '@mawa/shared';
import { IS_DEMO_BUILD, getClient } from '../lib/client.js';
import { diffReports, type ReportDiff } from '../lib/compare.js';
import { KIND_NAME } from '../lib/copy.js';

/**
 * "지난 실행 대비": the latest earlier run of the same question, diffed by source ids.
 * In real mode this is last week's report when the agent runs weekly; with fixed demo data it says so.
 */
export function PreviousRun({ report, runId, prompt }: { report: WeeklyWorkReport; runId: string | null; prompt: string | null }) {
  const [state, setState] = useState<{ diff: ReportDiff; at: string } | 'none' | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const runs = await getClient().listRuns().catch(() => []);
      const me = runs.find((r) => r.runId === runId);
      const at = me ? me.createdAt : report.generatedAt;
      const prev = runs
        .filter((r) => r.runId !== runId && r.prompt === prompt && r.status === 'success' && r.kind !== 'validation' && r.createdAt < at)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!prev) { if (alive) setState('none'); return; }
      const rec = await getClient().fetchRun(prev.runId).catch(() => null);
      if (alive) setState(rec?.report ? { diff: diffReports(report, rec.report), at: prev.createdAt } : 'none');
    })();
    return () => { alive = false; };
  }, [report, runId, prompt]);

  if (!state) return null;
  if (state === 'none') return <p className="mt-3 flex items-center gap-2 text-[13px] text-text-3"><History className="h-4 w-4" aria-hidden />같은 질문의 이전 실행이 없어 비교할 수 없습니다. 매주 실행하면 여기에 신규·지속·해소된 항목이 표시됩니다.</p>;
  const { diff, at } = state;
  const when = new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const delta = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
  return (
    <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium text-text"><History className="h-4 w-4 text-accent" aria-hidden />지난 실행 대비</span>
        <span className="text-xs text-text-3">{when} 실행과 비교</span>
      </div>
      {diff.identical ? (
        <p className="mt-1 text-[13px] text-text-2">변화 없음{IS_DEMO_BUILD ? ' · 데모의 샘플 데이터는 고정이라 같은 결과가 나옵니다' : ''}.</p>
      ) : (
        <>
          <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
            {diff.counts.map((c) => <span key={c.kind}>{KIND_NAME[c.kind]} {c.now} <span className={c.now - c.prev > 0 ? 'text-ok' : c.now - c.prev < 0 ? 'text-gmail' : 'text-text-3'}>({delta(c.now - c.prev)})</span></span>)}
          </div>
          <ul className="mt-2 space-y-1 text-[13px]">
            {diff.added.slice(0, 3).map((i) => <li key={`a${i.id}`}><span className="tag mr-1.5 bg-danger/15 text-danger">신규</span>{i.text}</li>)}
            {diff.resolved.slice(0, 3).map((i) => <li key={`r${i.id}`} className="text-text-2"><span className="tag mr-1.5 bg-ok/15 text-ok">해소</span>{i.text}</li>)}
            {diff.continuing.length > 0 && <li className="text-text-3">지속 {diff.continuing.length}건 (지난 실행에도 있던 주의 항목)</li>}
          </ul>
        </>
      )}
    </div>
  );
}
