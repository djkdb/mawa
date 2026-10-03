import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { DataPolicy, McpServerId } from '@mawa/shared';
import catalog from '@mawa/shared/demo/mcp-catalog.json';
import { IS_DEMO_BUILD } from '../lib/client.js';
import { DEMO_POLICY } from '../lib/demo-client.js';
import { getPolicy, setPolicy } from '../lib/http-client.js';
import { SERVER_COLOR, SERVER_NAME } from '../lib/copy.js';

type Catalog = { servers: Record<string, { tools: Array<{ name: string }> }> };
const SERVERS: McpServerId[] = ['github', 'gmail', 'calendar', 'lms'];
const ALL_TOOLS = SERVERS.flatMap((s) => ((catalog as unknown as Catalog).servers[s]?.tools ?? []).map((t) => `${s}__${t.name}`));

/**
 * The data policy the agent runs under: which MCP tools it may call, which items never reach the LLM
 * or the report, and whether email addresses are masked. In the demo it is read-only (the recordings
 * ran under it); with the API it is stored in this browser and sent with every run.
 */
export function PolicyEditor() {
  const saved = IS_DEMO_BUILD ? { ...DEMO_POLICY } : getPolicy();
  const [tools, setTools] = useState<Set<string>>(new Set(saved?.allowedTools ?? ALL_TOOLS));
  const [exclude, setExclude] = useState((saved?.exclude ?? []).join(', '));
  const [mask, setMask] = useState(saved?.maskEmails ?? true);
  const [maskPh, setMaskPh] = useState(saved?.maskPii ?? true);
  const [msg, setMsg] = useState<string | null>(null);
  const ro = IS_DEMO_BUILD;
  const save = () => {
    const p: Partial<DataPolicy> = { exclude: exclude.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30), maskEmails: mask, maskPii: maskPh, ...(tools.size < ALL_TOOLS.length ? { allowedTools: [...tools] } : {}) };
    setPolicy(p);
    setMsg('저장했습니다. 다음 실행부터 적용됩니다.');
  };
  const toggle = (t: string) => setTools((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  return (
    <section aria-labelledby="policy-heading" className="surface mt-5 p-5">
      <h2 id="policy-heading" className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck className="h-4 w-4 text-ok" aria-hidden />데이터 접근 정책</h2>
      <p className="mt-1 text-[13px] text-text-3">
        에이전트가 쓸 수 있는 도구, LLM과 리포트에서 뺄 항목, 메일 주소 가리기를 정합니다. 실행마다 적용 결과가 리포트의 ‘데이터 사용 내역’과 감사 로그에 남습니다.
        {ro && ' 데모 기록은 아래 정책으로 실행됐고, 여기서는 바꿀 수 없습니다.'}
      </p>

      <fieldset className="mt-4" disabled={ro}>
        <legend className="text-sm font-medium text-text-2">LLM·리포트에서 뺄 단어 (보낸 사람·제목·본문 미리보기에서 찾음)</legend>
        <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="예: 엄마, 쿠폰, 병원" aria-label="제외할 단어, 쉼표로 구분" className="hairline mt-1.5 min-h-10 w-full rounded-lg bg-bg px-3 text-sm text-text disabled:opacity-70" />
      </fieldset>

      <label className="mt-4 flex items-center gap-2 text-sm text-text-2">
        <input type="checkbox" checked={mask} disabled={ro} onChange={(e) => setMask(e.target.checked)} className="h-4 w-4" />
        LLM에 보낼 때 메일 주소 가리기 (m***@domain)
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-text-2">
        <input type="checkbox" checked={maskPh} disabled={ro} onChange={(e) => setMaskPh(e.target.checked)} className="h-4 w-4" />
        개인정보 가리기: 전화번호·학번·주민등록번호·계좌·카드번호 (LLM 요청과 화면 모두)
      </label>

      <fieldset className="mt-4" disabled={ro}>
        <legend className="text-sm font-medium text-text-2">에이전트가 쓸 수 있는 MCP 도구</legend>
        <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {ALL_TOOLS.map((t) => {
            const [server, name] = t.split('__') as [McpServerId, string];
            return (
              <label key={t} className="flex min-w-0 items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={tools.has(t)} onChange={() => toggle(t)} className="h-4 w-4 shrink-0" />
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SERVER_COLOR[server] }} aria-hidden />
                <span className="truncate font-mono text-xs">{name}</span>
                <span className="text-[11px] text-text-3">{SERVER_NAME[server]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!ro && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={save} className="min-h-9 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-on-accent hover:brightness-110">정책 저장</button>
          {msg && <span role="status" className="text-sm text-ok">{msg}</span>}
        </div>
      )}
    </section>
  );
}
