import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AuditRow } from '@mawa/shared';
import { getClient, getRecordedRun, recordedPersona } from '../lib/client.js';
import { persona } from '../lib/persona.js';
import type { AuditLog } from '../lib/types.js';
import { hrefFor } from '../lib/useHashRoute.js';
import { GatewayRun } from '../components/GatewayRun.js';
import { PolicyCompare } from '../components/PolicyCompare.js';
import { SecuritySummary } from '../components/SecuritySummary.js';

/**
 * The admin's first screen: not a week of work but what the organisation's AI use did with data —
 * the security summary over the members' runs, the policy comparison, and another MCP client
 * (Claude Code) going through the policy gateway. All from recorded, synthetic runs.
 */
export function AdminHome() {
  const p = persona();
  const [log, setLog] = useState<AuditLog | null>(null);
  const [runIds, setRunIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    void (async () => {
      const client = getClient();
      const audit = await client.getAudit();
      // Only the organisation's (worker) runs: map each recorded run to the runId inside its events.
      const ids = new Set<string>();
      for (const s of await client.listRuns()) {
        const id = s.runId.replace(/^recorded_/, '');
        if (s.recorded && recordedPersona(id) === p.data) { const r = getRecordedRun(id); if (r?.events[0]) ids.add(r.events[0].runId); }
      }
      setRunIds(ids);
      setLog(audit);
    })();
  }, [p.data]);
  const entries = log && runIds ? log.entries.filter((e) => log.source === 'server' || runIds.has(e.runId)) : null;
  const columns = p.policySet.flatMap((c) => { const r = getRecordedRun(c.id); return r ? [{ ...c, events: r.events }] : []; });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold">B사 · 구성원 AI 데이터 사용 현황</h2>
        <p className="mt-1 max-w-3xl text-sm text-text-2">{p.intro}를 한 화면에서 봅니다. 결제팀 구성원의 실행 기록 기준이며, 가상의 회사와 샘플 데이터입니다.</p>
      </div>
      {entries && log && <SecuritySummary entries={entries as Array<AuditRow & { prev: string; hash: string }>} chain={log.entries as unknown as Array<Record<string, unknown>>} />}
      {columns.length > 1 && <PolicyCompare columns={columns} current={p.defaultRun} />}
      <GatewayRun />
      <a href={hrefFor('audit')} className="inline-flex w-fit min-h-9 items-center gap-1 text-sm font-medium text-accent hover:underline">감사 로그 전체 보기 <ArrowRight className="h-4 w-4" aria-hidden /></a>
    </div>
  );
}
