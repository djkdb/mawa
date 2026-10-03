import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Cpu, GitBranch, GraduationCap, Mail } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import { SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';

type Connected = Extract<AgentEvent, { type: 'mcp_server_connected' }>;
type Message = Extract<AgentEvent, { type: 'mcp_message' }>;

const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar', 'lms'];
const ICON: Record<McpServerId, typeof Mail> = { github: GitBranch, gmail: Mail, calendar: CalendarDays, lms: GraduationCap };

export function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
}

interface ServerState {
  connected?: Connected;
  initializing: boolean;
  calling: string | null;
  calls: number;
  messages: number;
  sent: number;
  received: number;
  last?: Message;
}

/** Per-server connection state derived only from recorded/streamed protocol events. */
export function serverStates(events: AgentEvent[]): Map<McpServerId, ServerState> {
  const m = new Map<McpServerId, ServerState>(SERVERS.map((id) => [id, { initializing: false, calling: null, calls: 0, messages: 0, sent: 0, received: 0 }]));
  for (const e of events) {
    if (e.type === 'mcp_server_connected') { const s = m.get(e.server)!; s.connected = e; s.initializing = false; }
    else if (e.type === 'mcp_message') {
      const s = m.get(e.server)!;
      s.messages += 1; s.last = e;
      if (e.direction === 'client_to_server') s.sent += e.bytes; else s.received += e.bytes;
      if (e.method === 'initialize' && e.kind === 'request') s.initializing = true;
    } else if (e.type === 'tool_call_started') { const s = m.get(e.call.server)!; s.calling = e.call.name; }
    else if (e.type === 'tool_call_completed' || e.type === 'tool_call_failed') { const s = m.get(e.call.server)!; s.calling = null; s.calls += 1; }
  }
  return m;
}

/**
 * Agent ⇄ MCP servers, drawn from the protocol events of this run: which
 * servers completed the initialize handshake, what they reported about
 * themselves, and the JSON-RPC traffic on each stdio pipe.
 */
export function McpTopology({ events, live, recorded }: { events: AgentEvent[]; live: boolean; recorded: boolean }) {
  const states = serverStates(events);
  const used = SERVERS.filter((id) => events.some((e) => (e.type === 'tool_discovery_started' && e.servers.includes(id)) || ('server' in e && e.server === id)));
  if (!used.length) return null;
  const total = [...states.values()].reduce((n, s) => n + s.messages, 0);
  const handshakes = used.filter((id) => states.get(id)!.connected).length;
  return (
    <figure className="mt-4 rounded-lg bg-bg/60 p-3 sm:p-4" aria-label="MCP 연결 상태">
      <div className="grid gap-3 md:grid-cols-[200px_72px_minmax(0,1fr)] md:items-center md:gap-0">
        <div className="hairline rounded-lg bg-surface-2 p-3" style={{ gridRow: `span ${used.length}` }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-text"><Cpu className="h-4 w-4 text-accent" aria-hidden />에이전트</div>
          <div className="mt-1 text-xs text-text-2">MCP 클라이언트 · <span className="whitespace-nowrap font-mono">mawa-agent</span></div>
          <div className="tnum mt-2 text-xs text-text-3">핸드셰이크 {handshakes}/{used.length} · 메시지 {total}개</div>
        </div>
        {used.map((id) => {
          const s = states.get(id)!;
          const Icon = ICON[id];
          const color = SERVER_COLOR[id];
          const active = live && (s.calling !== null || s.initializing);
          const toServer = s.last?.direction !== 'server_to_client';
          const unused = !live && s.connected && s.calls === 0;
          const status = s.calling ? `${s.calling} 호출 중` : unused ? '연결됨 · 이번 계획에 없음' : s.connected ? '연결됨' : s.initializing ? '핸드셰이크 중' : '대기';
          return (
            <div key={id} className="contents">
              <div className="relative hidden h-full min-h-[64px] items-center md:flex" aria-hidden>
                <div className="h-0.5 w-full" style={{ background: s.connected || s.initializing ? color : 'var(--color-line)', opacity: s.connected ? 0.8 : 0.4 }} />
                {active && <span className={`wire-dot ${toServer ? 'wire-out' : 'wire-in'}`} style={{ background: color }} />}
              </div>
              <div className="hairline flex min-w-0 items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 md:my-1" style={{ borderLeft: `3px solid ${s.connected ? color : 'var(--color-line)'}` }}>
                <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-text">{SERVER_NAME[id]}</span>
                    {s.connected && <span className="truncate font-mono text-[11px] text-text-3 max-sm:hidden">{s.connected.serverInfo.name} v{s.connected.serverInfo.version}</span>}
                  </div>
                  <div className="tnum truncate text-xs text-text-2 max-sm:hidden">
                    {s.connected ? `stdio · MCP ${s.connected.protocolVersion}` : 'stdio'}
                    {s.messages > 0 && <> · 메시지 {s.messages} · ↑{kb(s.sent)} ↓{kb(s.received)}</>}
                  </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium ${active ? 'text-text' : 'text-text-2'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'animate-pulse bg-accent' : s.connected && !unused ? 'bg-ok' : 'bg-text-3'}`} aria-hidden />
                  {status}{s.calls > 0 && !s.calling ? ` · 호출 ${s.calls}회` : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-text-3">
        <span className="text-text-2">쉽게 말해, 에이전트가 앱마다 붙은 연결 프로그램(MCP 서버)에 표준 형식(JSON-RPC)의 요청을 보내 데이터를 받아옵니다. </span>
        {recorded ? '기록 당시 stdio로 오간 실제 JSON-RPC 메시지를 재생합니다. 서버는 샘플 데이터 모드(--mode=demo)로 실행됐습니다.' : '각 MCP 서버는 별도 프로세스로 실행되고 stdio로 JSON-RPC 메시지를 주고받습니다.'}
      </figcaption>
    </figure>
  );
}

function pretty(preview: string): string {
  if (preview.endsWith('…')) return preview;
  try { return JSON.stringify(JSON.parse(preview), null, 2); } catch { return preview; }
}

/** One JSON-RPC message row; expands to the (size-capped) message body. */
/** The tool name inside a tools/call request body, if the preview carries it. */
export function toolNameOf(preview: string): string | null {
  try { const v = JSON.parse(preview) as { params?: { name?: unknown } }; return typeof v.params?.name === 'string' ? v.params.name : null; } catch { return null; }
}

export function WireRow({ m, t0, tool }: { m: Pick<Message, 'server' | 'direction' | 'kind' | 'method' | 'rpcId' | 'bytes' | 'preview'> & { timestamp?: string }; t0?: number; tool?: string | null }) {
  const [open, setOpen] = useState(false);
  const out = m.direction === 'client_to_server';
  return (
    <li className="border-t border-line/50 first:border-t-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-left font-mono text-[11px] hover:bg-surface-2 max-sm:py-2">
        {t0 !== undefined && m.timestamp && <span className="tnum w-12 shrink-0 text-right text-text-3 max-sm:order-last max-sm:w-auto max-sm:text-left">+{new Date(m.timestamp).getTime() - t0}ms</span>}
        <span className="inline-flex w-[76px] shrink-0 items-center gap-1" style={{ color: SERVER_COLOR[m.server] }}>
          {out ? <ArrowRight className="h-3 w-3" aria-label="클라이언트 → 서버" /> : <ArrowLeft className="h-3 w-3" aria-label="서버 → 클라이언트" />}{m.server}
        </span>
        <span className={`w-[68px] shrink-0 max-sm:order-last max-sm:w-auto ${m.kind === 'error' ? 'text-danger' : 'text-text-3'}`}>{m.kind}</span>
        <span className="min-w-0 flex-1 truncate text-text">{m.method ?? ''}{tool ? <span className="text-text-2"> {tool}</span> : null}{m.rpcId !== undefined ? <span className="text-text-3"> #{m.rpcId}</span> : null}</span>
        <span className="tnum shrink-0 text-text-3">{kb(m.bytes)}</span>
        <ChevronRight className={`h-3 w-3 shrink-0 text-text-3 transition ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {open && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-bg px-3 py-2 font-mono text-[11px] text-text-2">{pretty(m.preview)}</pre>}
    </li>
  );
}

export function WireLog({ events }: { events: AgentEvent[] }) {
  const msgs = events.filter((e): e is Message => e.type === 'mcp_message');
  if (!msgs.length) return null;
  const t0 = new Date(events[0]!.timestamp).getTime();
  // Responses carry no tool name; take it from the request with the same server and id.
  const names = new Map<string, string>();
  for (const m of msgs) if (m.kind === 'request' && m.method === 'tools/call') { const n = toolNameOf(m.preview); if (n) names.set(`${m.server}:${m.rpcId}`, n); }
  const toolFor = (m: Message) => (m.method === 'tools/call' ? names.get(`${m.server}:${m.rpcId}`) ?? null : null);
  return (
    <div className="mt-2 max-h-96 overflow-auto rounded-lg bg-bg">
      <p className="px-3 pt-2 text-xs text-text-3">MCP 클라이언트가 stdio로 보내고 받은 메시지입니다. 긴 문자열과 배열은 줄여서 기록합니다.</p>
      <ol aria-label="JSON-RPC 메시지" className="mt-1">{msgs.map((m, i) => <WireRow key={i} m={m} t0={t0} tool={toolFor(m)} />)}</ol>
    </div>
  );
}
