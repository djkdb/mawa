import { CalendarDays, GitBranch, Mail, Link2, Unlink } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { IS_DEMO_BUILD, type IntegrationStatus, type Status } from '../lib/client.js';
import { SERVER_NAME } from '../lib/copy.js';

type Catalog = { servers: Record<string, { tools: Array<{ name: string }> }> };
const CATALOG = catalog as unknown as Catalog;
const ICON: Record<McpServerId, React.ReactNode> = { github: <GitBranch className="h-4 w-4" aria-hidden />, gmail: <Mail className="h-4 w-4" aria-hidden />, calendar: <CalendarDays className="h-4 w-4" aria-hidden /> };
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar'];

export function McpConnections({ status, events, onDisconnect }: { status: Status | null; events: AgentEvent[]; onDisconnect: (p: 'github' | 'google') => void }) {
  const calls = new Map<McpServerId, number>();
  for (const e of events) if (e.type === 'tool_call_completed') calls.set(e.call.server, (calls.get(e.call.server) ?? 0) + 1);
  return (
    <section aria-labelledby="mcp-heading" className="surface p-5">
      <h2 id="mcp-heading" className="text-[15px] font-semibold">연결된 소스</h2>
      <p className="mt-0.5 text-[13px] text-text-3">소스마다 독립된 MCP 서버가 붙습니다.</p>
      <ul className="mt-3 divide-y divide-line/70">
        {SERVERS.map((id) => {
          const tools = CATALOG.servers[id]?.tools.length ?? 0;
          const used = calls.get(id) ?? 0;
          const provider = id === 'github' ? 'github' : 'google';
          const integ: IntegrationStatus | null = status && !IS_DEMO_BUILD ? status.integrations[provider].status : null;
          const account = status && !IS_DEMO_BUILD ? status.integrations[provider].account : null;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-text-3">{ICON[id]}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text">{SERVER_NAME[id]}</div>
                  <div className="tnum truncate text-xs text-text-3">
                    도구 {tools}개{used ? ` · 이번 실행 ${used}회 조회` : ''}
                    {!IS_DEMO_BUILD && (integ === 'connected' ? ` · 연결됨${account ? ` (${account})` : ''}` : integ === 'disconnected' ? ' · 연결 안 됨' : ' · OAuth 미설정')}
                  </div>
                </div>
              </div>
              {IS_DEMO_BUILD ? (
                <span className="text-xs text-text-3">샘플</span>
              ) : integ === 'connected' ? (
                <button type="button" onClick={() => onDisconnect(provider)} className="hairline inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-text-2 hover:text-text"><Unlink className="h-3 w-3" aria-hidden /> 해제</button>
              ) : integ === 'disconnected' ? (
                <a href={status!.integrations[provider].connectUrl} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-2 px-2 py-1 text-xs text-text"><Link2 className="h-3 w-3" aria-hidden /> 연결</a>
              ) : (
                <span className="text-xs text-text-3">미설정</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
