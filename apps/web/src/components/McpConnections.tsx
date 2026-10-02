import { CalendarDays, GitBranch, Mail, Link2, Unlink } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { IS_DEMO_BUILD, type IntegrationStatus, type Status } from '../lib/client.js';

type Catalog = { servers: Record<string, { tools: Array<{ name: string }> }> };
const CATALOG = catalog as unknown as Catalog;
const ICON: Record<McpServerId, React.ReactNode> = { github: <GitBranch className="h-4 w-4" aria-hidden />, gmail: <Mail className="h-4 w-4" aria-hidden />, calendar: <CalendarDays className="h-4 w-4" aria-hidden /> };
const NAME: Record<McpServerId, string> = { github: 'GitHub MCP', gmail: 'Gmail MCP', calendar: 'Calendar MCP' };
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar'];

/**
 * In the browser-only demo: the three servers as recorded (tool counts from the
 * generated catalog, calls from the current replay). With the API: live OAuth
 * connection status with Connect / Disconnect.
 */
export function McpConnections({ status, events, onDisconnect }: { status: Status | null; events: AgentEvent[]; onDisconnect: (p: 'github' | 'google') => void }) {
  const calls = new Map<McpServerId, number>();
  for (const e of events) if (e.type === 'tool_call_completed') calls.set(e.call.server, (calls.get(e.call.server) ?? 0) + 1);

  return (
    <section aria-labelledby="mcp-heading" className="panel p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="mcp-heading" className="eyebrow !text-white">MCP connections</h2>
        <span className="font-mono text-[10px] text-fog">stdio · official SDK</span>
      </div>
      <ul className="mt-2 divide-y divide-line/60">
        {SERVERS.map((id) => {
          const tools = CATALOG.servers[id]?.tools.length ?? 0;
          const used = calls.get(id) ?? 0;
          const provider = id === 'github' ? 'github' : 'google';
          const integ: IntegrationStatus | null = status && !IS_DEMO_BUILD ? status.integrations[provider].status : null;
          const account = status && !IS_DEMO_BUILD ? status.integrations[provider].account : null;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-fog">{ICON[id]}</span>
                <div className="min-w-0">
                  <div className="text-sm text-white">{NAME[id]}</div>
                  <div className="truncate font-mono text-[10px] text-fog">
                    {tools} tools{used ? ` · ${used} call${used > 1 ? 's' : ''} in this run` : ''}
                    {IS_DEMO_BUILD ? ' · synthetic fixtures' : integ === 'connected' ? ` · connected${account ? ` · ${account}` : ''}` : integ === 'disconnected' ? ' · not connected' : ' · OAuth not configured'}
                  </div>
                </div>
              </div>
              {IS_DEMO_BUILD ? (
                <span className="shrink-0 rounded-md border border-amber-400/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300">Demo</span>
              ) : integ === 'connected' ? (
                <button type="button" onClick={() => onDisconnect(provider)} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-fog hover:text-white">
                  <Unlink className="h-3 w-3" aria-hidden /> Disconnect
                </button>
              ) : integ === 'disconnected' ? (
                <a href={status!.integrations[provider].connectUrl} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/50 bg-accent-soft px-2 py-1 font-mono text-[10px] text-white hover:brightness-110">
                  <Link2 className="h-3 w-3" aria-hidden /> Connect
                </a>
              ) : (
                <span className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-fog/70">Not configured</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-fog">
        {IS_DEMO_BUILD
          ? 'No service is contacted from this page. The runs above were recorded from the real MCP servers running in demo mode (synthetic data) and are replayed here.'
          : `Read-only API usage. Tokens are exchanged server-side and ${status?.tokenStore.persistent ? 'stored encrypted at rest.' : 'kept in memory until SESSION_ENCRYPTION_KEY is set.'}`}
      </p>
    </section>
  );
}
