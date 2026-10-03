import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { McpConnections } from '../components/McpConnections.js';
import { WireRow } from '../components/McpWire.js';
import { IS_DEMO_BUILD, type Status } from '../lib/client.js';
import { DEFAULT_SCOPES, SCOPE_MEANING, SERVER_COLOR, SERVER_NAME, TOOL_DESC_KO } from '../lib/copy.js';

type WireMsg = { direction: 'client_to_server' | 'server_to_client'; kind: 'request' | 'response' | 'notification' | 'error'; method?: string; rpcId?: string | number; bytes: number; preview: string };
type Connection = { transport: 'stdio'; command: string; protocolVersion: string; serverInfo: { name: string; version: string }; capabilities: string[] };
type JsonSchema = { properties?: Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>; required?: string[] };
type CatalogTool = { name: string; description: string; inputSchema: JsonSchema; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }; wire?: WireMsg[]; durationMs?: number };
type Catalog = { generatedAt: string; servers: Record<string, { connection?: Connection; tools: CatalogTool[] }> };
const CATALOG = catalog as unknown as Catalog;
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar'];

function Params({ schema }: { schema: JsonSchema }) {
  const props = Object.entries(schema.properties ?? {});
  if (!props.length) return <span className="text-xs text-text-3">파라미터 없음</span>;
  const req = new Set(schema.required ?? []);
  return (
    <span className="flex flex-wrap gap-1">
      {props.map(([k, v]) => (
        <span key={k} title={v.description} className="inline-flex items-center rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-2">
          {k}{req.has(k) ? <span className="text-gmail" aria-label="필수">*</span> : '?'}<span className="ml-1 text-text-3">{v.enum ? v.enum.join('|') : (v.type ?? 'any')}</span>
        </span>
      ))}
    </span>
  );
}

function ToolRow({ server, tool }: { server: McpServerId; tool: CatalogTool }) {
  const [open, setOpen] = useState(false);
  const wire = tool.wire ?? [];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[13px] text-text">{tool.name}</span>
          {tool.annotations?.readOnlyHint && <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[11px] text-emerald-200" title="서버가 tools/list에서 readOnlyHint: true로 선언">읽기 전용</span>}
        </span>
        {wire.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-8 items-center gap-1 text-xs text-text-2 hover:text-text">
            tools/call 예시{tool.durationMs !== undefined ? ` · ${tool.durationMs}ms` : ''}<ChevronRight className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[13px] text-text-2">{TOOL_DESC_KO[tool.name] ?? tool.description.replace(/\s*\[DEMO DATA\]$/, '')}</p>
      <div className="mt-1.5"><Params schema={tool.inputSchema} /></div>
      {open && (
        <div className="mt-2 overflow-hidden rounded-lg bg-bg">
          <p className="px-3 pt-2 text-xs text-text-3">기록된 요청과 응답입니다. 위 줄을 누르면 JSON 본문이 펼쳐집니다.</p>
          <ol aria-label={`${tool.name} JSON-RPC 메시지`} className="mt-1">{wire.map((m, i) => <WireRow key={i} m={{ ...m, server }} />)}</ol>
        </div>
      )}
    </li>
  );
}

/** Handshake facts for a server: from this session's latest run when it has one, otherwise from the recorded catalog. */
function connectionFor(id: McpServerId, events: AgentEvent[]): { c: Connection | undefined; from: 'run' | 'catalog' } {
  const live = [...events].reverse().find((e): e is Extract<AgentEvent, { type: 'mcp_server_connected' }> => e.type === 'mcp_server_connected' && e.server === id);
  if (live) return { c: live, from: 'run' };
  return { c: IS_DEMO_BUILD ? CATALOG.servers[id]?.connection : undefined, from: 'catalog' };
}

export function ConnectionsPage({ status, events, onDisconnect }: { status: Status | null; events: AgentEvent[]; onDisconnect: (p: 'github' | 'google') => void }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-w-0">
        <McpConnections status={status} events={events} onDisconnect={onDisconnect} />
        <section aria-labelledby="scopes-heading" className="surface mt-4 p-5">
          <h2 id="scopes-heading" className="text-[15px] font-semibold">연결할 때 요청하는 권한</h2>
          <p className="mt-0.5 text-[13px] text-text-3">연결 버튼을 누르기 전에 확인하세요. 토큰은 서버에만 저장되고 브라우저로 오지 않습니다.</p>
          {(['github', 'google'] as const).map((p) => {
            const scopes = status?.integrations[p].scopes ?? DEFAULT_SCOPES[p];
            return (
              <div key={p} className="mt-3">
                <div className="text-sm font-medium text-text">{p === 'github' ? 'GitHub' : 'Google (Gmail · Calendar)'}</div>
                <ul className="mt-1 space-y-1.5">
                  {scopes.length ? scopes.map((sc) => (
                    <li key={sc} className="text-[13px]">
                      <span className="text-text-2">{SCOPE_MEANING[sc]?.label ?? sc}</span> <code className="break-all font-mono text-[11px] text-text-3">{sc.replace('https://www.googleapis.com/auth/', '')}</code>
                      {SCOPE_MEANING[sc]?.risk && <p className="mt-0.5 text-xs text-amber-200/90">{SCOPE_MEANING[sc]!.risk}</p>}
                    </li>
                  )) : <li className="text-[13px] text-text-2">GitHub App 권한 사용 (scope 파라미터 없음)</li>}
                </ul>
              </div>
            );
          })}
        </section>
        <p className="mt-3 text-[13px] text-text-3">{IS_DEMO_BUILD ? '데모 워크스페이스에서는 MCP 서버가 샘플 데이터 모드(--mode=demo)로 실행됩니다. 실제 계정 연결은 API 서버와 OAuth 설정이 필요합니다.' : '읽기 전용 API만 사용합니다. 토큰은 서버에서 암호화해 보관하고, MCP 서버 프로세스에는 환경 변수로만 전달합니다.'}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {SERVERS.map((id) => {
          const { c, from } = connectionFor(id, events);
          const tools = CATALOG.servers[id]?.tools ?? [];
          return (
            <section key={id} className="surface p-5" aria-labelledby={`tools-${id}`} style={{ boxShadow: `inset 3px 0 0 ${SERVER_COLOR[id]}` }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`tools-${id}`} className="flex items-center gap-2 text-[15px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: SERVER_COLOR[id] }} aria-hidden />{SERVER_NAME[id]} MCP 서버</h3>
                <span className="text-xs text-text-3">도구 {tools.length}개</span>
              </div>
              {c ? (
                <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] sm:grid-cols-[96px_minmax(0,1fr)]">
                  <dt className="text-text-3">서버</dt><dd className="font-mono text-text">{c.serverInfo.name} v{c.serverInfo.version}</dd>
                  <dt className="text-text-3">프로토콜</dt><dd className="text-text">MCP {c.protocolVersion} · JSON-RPC 2.0</dd>
                  <dt className="text-text-3">전송</dt><dd className="text-text">{c.transport} (자식 프로세스)</dd>
                  <dt className="text-text-3">실행 명령</dt><dd className="min-w-0 break-all font-mono text-xs text-text-2">{c.command}</dd>
                  <dt className="text-text-3">기능</dt><dd className="text-text">{c.capabilities.join(', ') || '없음'}</dd>
                  <dd className="text-xs text-text-3 sm:col-span-2">{from === 'run' ? '이번 세션의 최근 실행에서 서버가 initialize 응답으로 보고한 값' : `${new Date(CATALOG.generatedAt).toLocaleDateString('ko-KR')} 기록 당시 initialize 응답`}</dd>
                </dl>
              ) : (
                <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-text-3">에이전트를 실행하면 이 서버와의 initialize 핸드셰이크 결과가 여기에 표시됩니다.</p>
              )}
              <ul className="mt-2 divide-y divide-line/60">{tools.map((t) => <ToolRow key={t.name} server={id} tool={t} />)}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
