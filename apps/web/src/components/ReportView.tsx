import { useEffect, useState } from 'react';
import { CheckSquare, ChevronDown, ClipboardCopy, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { AgentEvent, ReportSectionId, Source, WeeklyWorkReport } from '@mawa/shared';
import { DEMO_EXAMPLES } from '../lib/client.js';
import { EXAMPLE_META, KIND_NAME, KIND_SERVER, SERVER_COLOR, SOURCE_TYPE_NAME, periodKo, sectionTitle, timeKo } from '../lib/copy.js';
import { copyText, exportReport } from '../lib/export.js';
import { ModeBadge } from './ModeBadge.js';
import { PreviousRun } from './PreviousRun.js';
import { SectionBody, type BlockCtx } from './ReportBlocks.js';

export function reportTitle(prompt: string | null): string {
  const ex = DEMO_EXAMPLES.find((e) => e.prompt === prompt);
  return ex ? (EXAMPLE_META[ex.id]?.title ?? '주간 업무 리포트') : prompt ? prompt.replace(/[.?]$/, '') : '주간 업무 리포트';
}

export function StatStrip({ report }: { report: WeeklyWorkReport }) {
  const counts = new Map<string, number>();
  for (const s of report.sources) { const k = String(s.metadata['kind'] ?? ''); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const stats = ['commit', 'pr', 'issue', 'event', 'msg'].filter((k) => counts.has(k));
  if (!stats.length) return null;
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg bg-line" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((k) => (
        <div key={k} className="bg-surface-2 px-3 py-2.5 sm:px-4 sm:py-3" style={{ boxShadow: `inset 0 2px 0 ${SERVER_COLOR[KIND_SERVER[k] ?? 'github']}` }}>
          <dt className="whitespace-nowrap text-xs text-text-3">{KIND_NAME[k]}</dt>
          <dd className="tnum text-xl font-semibold text-text sm:text-2xl">{counts.get(k)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Decision first: what needs attention and what to do, then the evidence it was drawn from. */
const DECISION: ReportSectionId[] = ['overview', 'potential_risks', 'next_actions'];
const HIDDEN_KEY = (runId: string) => `mawa.hidden.${runId}`;
function loadHidden(runId: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY(runId)) ?? '[]') as unknown; return new Set(Array.isArray(v) ? (v as string[]) : []); } catch { return new Set(); }
}

/** What the validator did to the model's draft, from the run's warnings. */
function Verification({ warnings, events }: { warnings: string[]; events: AgentEvent[] }) {
  const gen = events.find((e) => e.type === 'report_generated');
  const dropped = warnings.filter((w) => w.startsWith('Dropped item'));
  const downgraded = warnings.filter((w) => w.startsWith('Downgraded'));
  const flagged = warnings.filter((w) => w.startsWith('Suspicious'));
  const quote = (w: string) => /"(.*)"$/.exec(w)?.[1] ?? w;
  const ids = (w: string) => /source\(s\) (.+?): "/.exec(w)?.[1] ?? '';
  const clean = !dropped.length && !downgraded.length;
  return (
    <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${clean ? 'bg-ok/10' : 'bg-caution/10'}`}>
      <div className="flex items-center gap-2 font-medium text-text">
        {clean ? <ShieldCheck className="h-4 w-4 text-ok" aria-hidden /> : <TriangleAlert className="h-4 w-4 text-caution" aria-hidden />}
        출처 검증: {clean ? '모든 항목의 인용이 실제로 조회한 출처와 일치합니다' : `초안에서 ${dropped.length}건 제외, ${downgraded.length}건 '추론'으로 낮춤`}
        {gen?.type === 'report_generated' && <span className="font-normal text-text-3">· 출처 {gen.report.sources.length}건 대조</span>}
      </div>
      {!clean && (
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {dropped.map((w, i) => <li key={`d${i}`}><span className="tag mr-1.5 bg-rose-400/15 text-rose-200">제외</span>“{quote(w)}” <span className="text-text-3">— 조회한 적 없는 출처 <code className="font-mono text-[11px]">{ids(w)}</code>를 인용</span></li>)}
          {downgraded.map((w, i) => <li key={`g${i}`}><span className="tag mr-1.5 bg-inferred/15 text-inferred">낮춤</span>“{quote(w)}” <span className="text-text-3">— 출처 없이 ‘확인됨’이라고 주장</span></li>)}
        </ul>
      )}
      {flagged.length > 0 && <p className="mt-1.5 text-[13px] text-text-2">지시문이 들어 있는 외부 텍스트 {flagged.length}건을 감지했고, 데이터로만 다뤘습니다.</p>}
    </div>
  );
}

export function ReportView({ report, warnings, recorded, prompt, onAnnounce, events = [], note, runId = null }: { report: WeeklyWorkReport; warnings: string[]; recorded: boolean; prompt: string | null; onAnnounce: (msg: string) => void; events?: AgentEvent[]; note?: string | null; runId?: string | null }) {
  const demo = report.mode === 'demo';
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(report.runId));
  const [editing, setEditing] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(HIDDEN_KEY(report.runId), JSON.stringify([...hidden])); } catch { /* per-viewer convenience only */ } }, [hidden, report.runId]);
  const title = note?.startsWith('출처 검증') ? '출처 검증 시연' : reportTitle(prompt);
  const all = report.sections.flatMap((s) => s.items);
  const visible = all.filter((i) => !hidden.has(i.id));
  const observed = visible.filter((i) => i.confidence === 'observed').length;
  const groups = new Map<Source['type'], Source[]>();
  for (const s of report.sources) groups.set(s.type, [...(groups.get(s.type) ?? []), s]);
  const flagged = new Map(events.flatMap((e) => (e.type === 'llm_request' ? e.flagged : [])).map((f) => [f.sourceId, f.reason]));
  const ordered = [...report.sections].sort((a, b) => (DECISION.includes(a.id) ? DECISION.indexOf(a.id) : 10) - (DECISION.includes(b.id) ? DECISION.indexOf(b.id) : 10));
  const firstEvidence = ordered.find((s) => !DECISION.includes(s.id))?.id;
  const slackLines = exportReport(report, { title, prompt, hidden, format: 'slack' }).split('\n').length;

  const copy = async (format: 'markdown' | 'slack') => {
    const ok = await copyText(exportReport(report, { title, prompt, hidden, format }));
    const msg = ok ? `${format === 'slack' ? 'Slack' : 'Markdown'} 형식으로 복사했습니다${hidden.size ? ` (숨긴 항목 ${hidden.size}개 제외)` : ''}.` : '복사하지 못했습니다. 브라우저가 클립보드 접근을 막았습니다.';
    setCopied(msg);
    onAnnounce(msg);
    setTimeout(() => setCopied(null), 2500);
  };
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ctx: BlockCtx = { report, byId, demo, hidden, toggle, editing, flagged };

  return (
    <article id="report" aria-labelledby="report-heading" className="surface scroll-mt-20 p-5 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="report-heading" className="text-2xl font-semibold">{title}</h2>
          <p className="tnum mt-1 text-sm text-text-2">{periodKo(report.period)} · 항목 {visible.length}개 · 출처로 확인 {observed}개 · 판단(추론) {visible.length - observed}개</p>
          {prompt && <p className="mt-0.5 text-[13px] text-text-3">질문: {prompt}</p>}
        </div>
        <ModeBadge mode={report.mode} />
      </header>

      {note && <p className="mt-3 rounded-lg bg-inferred/10 px-4 py-3 text-sm text-text">{note}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy('slack')} className="hairline inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm text-text hover:brightness-110"><ClipboardCopy className="h-4 w-4" aria-hidden />Slack용 복사 <span className="tnum text-xs text-text-3">{slackLines}줄</span></button>
        <button type="button" onClick={() => void copy('markdown')} className="hairline inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-2 hover:text-text">Markdown 전체 복사</button>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm ${editing ? 'bg-accent-2 text-text' : 'text-text-2 hover:text-text'}`}><CheckSquare className="h-4 w-4" aria-hidden />{editing ? '고르기 끝' : '복사할 항목 고르기'}</button>
        {hidden.size > 0 && <button type="button" onClick={() => setHidden(new Set())} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-sm text-text-2 hover:text-text"><RotateCcw className="h-3.5 w-3.5" aria-hidden />숨긴 항목 {hidden.size}개 되돌리기</button>}
        {copied && <span className="text-sm text-ok">{copied}</span>}
      </div>
      {editing && <p className="mt-2 text-[13px] text-text-3">항목마다 ‘빼기’를 누르면 복사본에서 빠집니다. 고른 상태는 이 브라우저에 저장됩니다.</p>}

      <div className="mt-5"><StatStrip report={report} /></div>
      <Verification warnings={warnings} events={events} />
      {!note && <PreviousRun report={report} runId={runId} prompt={prompt} />}

      {demo && <p className="mt-3 text-[13px] text-text-3">{recorded ? '기록된 실행을 재생한 결과입니다. ' : ''}가상의 demo-user 계정의 샘플 데이터로 만든 리포트이며 실제 계정 정보가 아닙니다.</p>}

      <nav aria-label="리포트 섹션" className="mt-4 flex flex-wrap gap-1.5">
        {ordered.map((s) => <a key={s.id} href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }} className="inline-flex min-h-8 items-center rounded-full bg-surface-2 px-3 text-xs text-text-2 hover:text-text">{sectionTitle(s.id, prompt)} <span className="tnum ml-1 text-text-3">{s.items.length}</span></a>)}
      </nav>

      {ordered.map((section) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`} className="mt-8 scroll-mt-24">
          {section.id === firstEvidence && <p className="mb-6 border-t border-line pt-6 text-xs font-medium text-text-3">근거 자료 · 위 판단에 쓰인 원본 활동</p>}
          <h3 id={`sec-${section.id}`} className="scroll-mt-24 text-base font-semibold">{sectionTitle(section.id, prompt)}</h3>
          <SectionBody section={section} ctx={ctx} />
        </section>
      ))}
      <div className="mt-8 border-t border-line pt-4">
        <button type="button" onClick={() => setShowSources((o) => !o)} aria-expanded={showSources} aria-controls="sources-body" className="flex min-h-9 w-full items-center justify-between gap-3 text-left">
          <span>
            <span className="text-[15px] font-semibold">조회한 출처 {report.sources.length}건</span>
            <span className="ml-2 text-sm text-text-3">{[...groups.entries()].map(([t, l]) => `${SOURCE_TYPE_NAME[t]} ${l.length}`).join(' · ')}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-text-2 transition ${showSources ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showSources && (
          <div id="sources-body" className="mt-4 grid gap-6 md:grid-cols-3">
            {[...groups.entries()].map(([type, list]) => (
              <div key={type} className="min-w-0">
                <div className="mb-2 text-sm font-medium text-text-2">{SOURCE_TYPE_NAME[type]}</div>
                <ul className="space-y-2">
                  {list.map((s) => (
                    <li key={s.id} className="min-w-0 text-sm">
                      {s.url && !demo ? <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-text hover:underline" title={s.title}>{s.title}</a> : <span className="block truncate text-text" title={s.title}>{s.title}</span>}
                      <span className="block truncate text-xs text-text-3">{KIND_NAME[String(s.metadata['kind'] ?? '')] ?? ''}{s.timestamp ? ` · ${timeKo(s.timestamp)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <details className="mt-4 text-sm text-text-3">
          <summary className="cursor-pointer">실행 메모 원문 {warnings.length}건</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
    </article>
  );
}
