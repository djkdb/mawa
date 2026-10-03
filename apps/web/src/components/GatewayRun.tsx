import { useState } from 'react';
import { ChevronDown, Network, ShieldAlert, ShieldCheck } from 'lucide-react';
import gatewayRun from '@mawa/shared/demo/gateway-run.json';
import { verifyChain, type ChainCheck } from '@mawa/shared';
import { piiBreakdown } from '../lib/copy.js';

type Entry = { seq: number; at: string; client: string; action: string; server?: string; tool?: string; input?: Record<string, unknown>; rows?: number; detail?: string; maskedEmails?: number; maskedPii?: number; piiKinds?: Record<string, number>; prev: string; hash: string };
const RUN = gatewayRun as unknown as { recordedAt: string; model: string; prompt: string; answer: string; policy: { allowedTools?: string[] }; audit: Entry[] };

/**
 * A recorded run of another MCP client — Claude Code — going through the policy gateway instead of
 * this agent: the question, the answer it produced from masked results, and the gateway's own
 * hash-chained audit lines (with the client name from the MCP handshake).
 */
export function GatewayRun() {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<ChainCheck | null>(null);
  return (
    <section aria-labelledby="gw-heading" className="surface mt-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Network className="h-[18px] w-[18px] text-accent" aria-hidden />
        <h2 id="gw-heading" className="text-[15px] font-semibold">게이트웨이 기록 · 다른 MCP 클라이언트</h2>
        <span className="text-xs text-text-3">Claude Code({RUN.model}) → mawa-gateway → MCP 서버 4개 · 샘플 데이터</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="gw-body" className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-text-2 hover:text-text">{open ? '접기' : '자세히'}<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden /></button>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-text-2">정책을 에이전트 밖의 MCP 서버(게이트웨이)로 분리했습니다. Claude Code가 이 게이트웨이에 붙으면 허용 목록 밖 도구는 보이지 않고, 결과는 가려진 채로 전달되며, 호출마다 클라이언트 이름과 함께 해시 체인 감사 로그가 남습니다.</p>
      {open && (
        <div id="gw-body" className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-2">질문</h3>
            <p className="mt-1 rounded-lg bg-bg px-3 py-2 text-sm text-text">{RUN.prompt}</p>
            <h3 className="mt-3 text-sm font-medium text-text-2">Claude Code의 답 (가려진 결과로 작성)</h3>
            <div className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-bg px-3 py-2 text-[13px] leading-relaxed text-text-2">{RUN.answer}</div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-text-2">게이트웨이 감사 로그 {RUN.audit.length}줄</h3>
              <button type="button" onClick={() => void verifyChain(RUN.audit as unknown as Array<Record<string, unknown>>).then(setCheck)} className="ml-auto min-h-8 rounded-md bg-surface-2 px-3 text-xs font-medium text-text hover:bg-bg">체인 검증</button>
            </div>
            {check && <p role="status" className={`mt-1 inline-flex items-center gap-1.5 text-xs ${check.ok ? 'text-ok' : 'text-danger'}`}>{check.ok ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden />}{check.ok ? `${check.count}줄 모두 일치` : `${check.brokenAt}번째 줄 실패 · ${check.reason}`}</p>}
            <ol className="mt-2 space-y-2">
              {RUN.audit.map((e) => (
                <li key={e.seq} className="rounded-lg bg-bg px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-baseline gap-x-2"><span className="tnum text-xs text-text-3">#{e.seq}</span><span className="font-medium text-text">{e.action === 'list' ? '도구 목록' : e.action === 'read' ? '읽기' : e.action === 'denied' ? '거절' : e.action}</span>{e.tool && <span className="font-mono text-xs text-text">{e.server}.{e.tool}</span>}<span className="text-xs text-text-3">{e.client}</span></div>
                  <div className="mt-0.5 text-xs text-text-2">{e.action === 'list' ? `보이는 도구 ${e.rows}개 · 정책으로 숨긴 도구 ${e.detail?.match(/\d+/)?.[0] ?? 0}개` : e.action === 'read' ? `${JSON.stringify(e.input)} · ${e.rows}건 · 메일 주소 ${e.maskedEmails ?? 0} · 개인정보 ${e.maskedPii ?? 0} 가림${e.maskedPii ? ` (${piiBreakdown(e.piiKinds)})` : ''}` : e.detail}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-text-3">hash {e.hash.slice(0, 16)}… ← prev {e.prev.slice(0, 16)}…</div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-text-3">재현: <code className="font-mono">npm run record:gateway-run</code> · 검증: <code className="font-mono">npm run audit:verify -- docs/examples/gateway-audit.chained.jsonl</code></p>
          </div>
        </div>
      )}
    </section>
  );
}
