import { useEffect, useState } from 'react';
import { Ban, EyeOff, Link2, Send, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { verifyChain, type AuditRow, type ChainCheck } from '@mawa/shared';
import { piiBreakdown } from '../lib/copy.js';
import { kb } from './McpWire.js';

/**
 * The security reviewer's first screen: what the policy did and whether the log is intact, in a few
 * lines, before the full table. Built from the stored audit log; the chain is verified on load.
 */
export function SecuritySummary({ entries, start }: { entries: Array<AuditRow & { prev: string; hash: string }>; start?: string | undefined }) {
  const [check, setCheck] = useState<ChainCheck | null>(null);
  useEffect(() => { void verifyChain(entries as unknown as Array<Record<string, unknown>>, start).then(setCheck); }, [entries, start]);
  const of = (a: AuditRow['action']) => entries.filter((e) => e.action === a);
  const denied = of('denied');
  const llm = of('llm');
  const flagged = new Set(llm.flatMap((e) => e.flagged ?? []));
  const kinds = llm.reduce<Record<string, number>>((acc, e) => { for (const [k, n] of Object.entries(e.piiKinds ?? {})) acc[k] = (acc[k] ?? 0) + (n ?? 0); return acc; }, {});
  const pii = Object.values(kinds).reduce((n, x) => n + x, 0);
  const emails = llm.reduce((n, e) => n + (e.maskedEmails ?? 0), 0);
  const external = llm.filter((e) => !e.provider?.startsWith('scripted'));
  const runs = new Set(entries.map((e) => e.runId)).size;

  const items: Array<{ Icon: LucideIcon; tone: string; title: string; detail: string }> = [
    check
      ? check.ok ? { Icon: ShieldCheck, tone: 'text-ok', title: '감사 로그 무결성 정상', detail: `${check.count}줄 해시 체인 일치 · 마지막 해시 ${check.head.slice(0, 12)}…` }
        : { Icon: ShieldAlert, tone: 'text-danger', title: '감사 로그 무결성 실패', detail: `${check.brokenAt}번째 줄 · ${check.reason}` }
      : { Icon: Link2, tone: 'text-text-3', title: '무결성 확인 중', detail: '' },
    { Icon: Ban, tone: denied.length ? 'text-danger' : 'text-text-3', title: `정책이 거절한 호출 ${denied.length}건`, detail: denied.length ? [...new Set(denied.map((d) => `${d.server}.${d.tool}`))].join(', ') : '허용 목록 밖 도구 요청 없음' },
    { Icon: TriangleAlert, tone: flagged.size ? 'text-warn' : 'text-text-3', title: `지시문이 섞인 외부 데이터 ${flagged.size}건`, detail: flagged.size ? `${[...flagged].slice(0, 3).join(', ')} · 데이터로만 다루고 따르지 않음` : '감지 없음' },
    { Icon: EyeOff, tone: 'text-inferred', title: `모델에 보내기 전 가림 · 개인정보 ${pii} · 메일 주소 ${emails}`, detail: pii ? piiBreakdown(kinds) : '가린 개인정보 없음' },
    { Icon: EyeOff, tone: 'text-text-2', title: `정책으로 뺀 항목 ${of('excluded').length}건`, detail: [...new Set(of('excluded').map((e) => e.detail))].join(', ') || '없음' },
    { Icon: Send, tone: 'text-accent', title: `LLM 요청 ${llm.length}회 · ${kb(llm.reduce((n, e) => n + (e.bytes ?? 0), 0))}`, detail: external.length ? `외부 모델: ${[...new Set(external.map((e) => e.provider))].join(', ')}` : '모두 스크립트(외부로 나간 데이터 없음)' },
  ];
  return (
    <section aria-labelledby="sec-summary" className="surface mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="sec-summary" className="text-[15px] font-semibold">보안 요약</h2>
        <span className="tnum text-sm text-text-3">실행 {runs}건 · 읽기 {of('read').length}회</span>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {items.map(({ Icon, tone, title, detail }) => (
          <li key={title} className="flex min-w-0 gap-2.5">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
            <div className="min-w-0"><div className="text-sm font-medium text-text">{title}</div>{detail && <div className="truncate text-xs text-text-3" title={detail}>{detail}</div>}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
