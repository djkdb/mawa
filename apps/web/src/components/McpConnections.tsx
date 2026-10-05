import { persona } from '../lib/persona.js';
import { useState } from 'react';
import { CalendarDays, GraduationCap, GitBranch, Mail, Link2, Loader2, Stethoscope, Unlink } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { IS_DEMO_BUILD, getClient, type IntegrationStatus, type Status } from '../lib/client.js';
import type { SourceTest } from '../lib/types.js';
import { summaryKo } from '../lib/copy.js';
import { friendlyError } from '../lib/friendly-error.js';
import { SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';

type Catalog = { servers: Record<string, { tools: Array<{ name: string }> }> };
const CATALOG = catalog as unknown as Catalog;
const ICON: Record<McpServerId, React.ReactNode> = { github: <GitBranch className="h-4 w-4" aria-hidden />, gmail: <Mail className="h-4 w-4" aria-hidden />, calendar: <CalendarDays className="h-4 w-4" aria-hidden />, lms: <GraduationCap className="h-4 w-4" aria-hidden /> };
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar', 'lms'];

export function McpConnections({ status, events, onDisconnect, onConnectLms }: { status: Status | null; events: AgentEvent[]; onDisconnect: (p: 'github' | 'google' | 'lms') => void; onConnectLms?: () => void }) {
  const [tests, setTests] = useState<Partial<Record<McpServerId, SourceTest | 'running' | { error: string }>>>({});
  const runTest = async (id: McpServerId) => {
    const c = getClient();
    if (!c.testSource) return;
    setTests((t) => ({ ...t, [id]: 'running' }));
    try { const r = await c.testSource(id); setTests((t) => ({ ...t, [id]: r })); } catch (e) { setTests((t) => ({ ...t, [id]: { error: e instanceof Error ? e.message : String(e) } })); }
  };
  const calls = new Map<McpServerId, number>();
  const hello = new Map<McpServerId, string>();
  for (const e of events) {
    if (e.type === 'tool_call_completed') calls.set(e.call.server, (calls.get(e.call.server) ?? 0) + 1);
    if (e.type === 'mcp_server_connected') hello.set(e.server, `${e.serverInfo.name} v${e.serverInfo.version}`);
  }
  return (
    <section id="connections" aria-labelledby="mcp-heading" className="surface scroll-mt-20 p-5">
      <h2 id="mcp-heading" className="text-[15px] font-semibold">연결된 소스</h2>
      <p className="mt-0.5 text-[13px] text-text-3">소스마다 독립된 MCP 서버가 붙습니다.</p>
      <ul className="mt-3 divide-y divide-line/70">
        {SERVERS.filter((id) => !IS_DEMO_BUILD || persona().servers.includes(id)).map((id) => {
          const tools = CATALOG.servers[id]?.tools.length ?? 0;
          const used = calls.get(id) ?? 0;
          const provider = id === 'github' ? 'github' : id === 'lms' ? 'lms' : 'google';
          const info = status && !IS_DEMO_BUILD ? status.integrations[provider] : undefined;
          const integ: IntegrationStatus | null = info ? info.status : null;
          const account = info ? info.account : null;
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="rounded-md p-1.5" style={{ color: SERVER_COLOR[id], background: `color-mix(in srgb, ${SERVER_COLOR[id]} 14%, transparent)` }}>{ICON[id]}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text">{SERVER_NAME[id]}{hello.get(id) && <span className="ml-2 font-mono text-[11px] font-normal text-text-3">{hello.get(id)}</span>}</div>
                  <div className="tnum truncate text-xs text-text-3">
                    {hello.has(id) ? 'stdio 연결 · ' : ''}도구 {tools}개{used ? ` · 이번 실행 ${used}회 호출` : ''}
                    {!IS_DEMO_BUILD && (integ === 'connected' ? ` · 연결됨${account ? ` (${account})` : ''}` : integ === 'disconnected' ? ' · 연결 안 됨' : id === 'lms' ? ' · API 업데이트 필요' : ' · OAuth 미설정')}
                  </div>
                </div>
              </div>
              {IS_DEMO_BUILD ? (
                <span className="text-xs text-text-3">샘플</span>
              ) : integ === 'connected' && provider === 'github' && status?.integrations.github.source === 'env' ? (
                <span className="shrink-0 text-xs text-text-3" title="서버의 MAWA_GITHUB_TOKEN(읽기 전용 토큰)으로 연결됨">서버 토큰</span>
              ) : integ === 'connected' ? (
                <span className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => void runTest(id)} disabled={tests[id] === 'running'} aria-label={`${SERVER_NAME[id]} 연결 테스트`} title="이 소스를 지금 한 번 읽어 봅니다 (읽기 전용, AI에 보내지 않음)" className="hairline inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-2 hover:text-text disabled:opacity-60">{tests[id] === 'running' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Stethoscope className="h-3 w-3" aria-hidden />} 테스트</button>
                <button type="button" onClick={() => onDisconnect(provider)} className="hairline inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-text-2 hover:text-text"><Unlink className="h-3 w-3" aria-hidden /> 해제</button>
                </span>
              ) : integ === 'disconnected' && id === 'lms' ? (
                <button type="button" onClick={onConnectLms} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-2 px-2 py-1 text-xs text-text"><Link2 className="h-3 w-3" aria-hidden /> 연결</button>
              ) : integ === 'disconnected' ? (
                <a href={info!.connectUrl} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-2 px-2 py-1 text-xs text-text"><Link2 className="h-3 w-3" aria-hidden /> 연결</a>
              ) : (
                <span className="text-xs text-text-3">미설정</span>
              )}
              {tests[id] && <TestResult id={id} result={tests[id]} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TOOL_KO: Record<string, string> = { get_repository_activity: '저장소 활동', get_open_issues: '열린 이슈', search_emails: '받은편지함', get_upcoming_events: '다가오는 일정(14일)', get_courses: '수강 과목', get_upcoming_deadlines: '마감(30일)', get_assignments: '과제(30일)' };

/** What the source returned just now, in words: counts per read, an empty-but-working hint, or the error. */
function TestResult({ id, result }: { id: McpServerId; result: SourceTest | 'running' | { error: string } }) {
  if (result === 'running') return <p role="status" className="basis-full text-xs text-text-3">{SERVER_NAME[id]}를 읽어 보는 중…</p>;
  if ('error' in result) return <p role="status" className="basis-full text-xs text-danger">{friendlyError(result.error).title} — {friendlyError(result.error).fix}</p>;
  if (!result.calls.length) return <p role="status" className="basis-full text-xs text-danger">서버를 시작하지 못했어요: {result.reason ?? '연결 안 됨'}</p>;
  const empty = result.ok && result.calls.every((c) => c.count === 0 || c.count === undefined);
  return (
    <div role="status" className="basis-full rounded-md bg-surface-2 px-3 py-2 text-xs">
      <ul className="space-y-0.5">
        {result.calls.map((c) => (
          <li key={c.tool} className={c.ok ? 'text-text-2' : 'text-danger'}>
            {c.ok ? '✓' : '✗'} {TOOL_KO[c.tool] ?? c.tool}: {c.ok ? summaryKo(c.summary ?? '') : `${friendlyError(c.error).title} · ${c.error ?? ''}`}
          </li>
        ))}
      </ul>
      {empty && <p className="mt-1 text-text-3">연결은 정상이고, 지금 기간에 해당하는 항목이 없어서 비어 있어요.{id === 'lms' ? ' eCampus는 교수님이 마감일을 등록한 과제·퀴즈만 보입니다.' : ''}</p>}
      {result.ok && !empty && <p className="mt-1 text-text-3">연결 정상. 실행할 때 AI가 이 소스의 도구를 골라야 리포트에 들어갑니다 — 질문에 「마감」「과제」「메일」처럼 소스를 떠올리게 하는 말을 넣어 보세요.</p>}
    </div>
  );
}
