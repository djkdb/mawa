import type { AgentEvent, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { McpConnections } from '../components/McpConnections.js';
import { IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { SERVER_COLOR, SERVER_NAME, TOOL_DESC_KO } from '../lib/copy.js';

type Catalog = { servers: Record<string, { tools: Array<{ name: string; description: string }> }> };
const CATALOG = catalog as unknown as Catalog;
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar'];

export function ConnectionsPage({ status, events, onDisconnect }: { status: Status | null; events: AgentEvent[]; onDisconnect: (p: 'github' | 'google') => void }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <McpConnections status={status} events={events} onDisconnect={onDisconnect} />
        <p className="mt-3 text-[13px] text-text-3">{IS_DEMO_BUILD ? '데모 워크스페이스에서는 샘플 데이터를 제공하는 MCP 서버가 연결되어 있습니다. 실제 계정 연결은 API 서버와 OAuth 설정이 필요합니다.' : '읽기 전용 API만 사용합니다. 토큰은 서버에서 암호화해 보관합니다.'}</p>
      </div>
      <div className="flex flex-col gap-4">
        {SERVERS.map((id) => (
          <section key={id} className="surface p-5" aria-labelledby={`tools-${id}`}>
            <h3 id={`tools-${id}`} className="flex items-center gap-2 text-[15px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: SERVER_COLOR[id] }} aria-hidden />{SERVER_NAME[id]} 도구</h3>
            <ul className="mt-3 divide-y divide-line/60">
              {CATALOG.servers[id]?.tools.map((t) => (
                <li key={t.name} className="py-2.5">
                  <div className="font-mono text-[13px] text-text">{t.name}</div>
                  <div className="text-[13px] text-text-2">{TOOL_DESC_KO[t.name] ?? t.description.replace(/\s*\[DEMO DATA\]$/, '')}</div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
