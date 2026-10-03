import { useState } from 'react';
import { ChevronDown, ClipboardCopy, EyeOff, RotateCcw } from 'lucide-react';
import type { Source, WeeklyWorkReport } from '@mawa/shared';
import { DEMO_EXAMPLES } from '../lib/client.js';
import { EXAMPLE_META, KIND_NAME, KIND_SERVER, PRIORITY_KO, SERVER_COLOR, SOURCE_TYPE_NAME, periodKo, sectionTitle, timeKo } from '../lib/copy.js';
import { copyText, exportReport } from '../lib/export.js';
import { ModeBadge } from './ModeBadge.js';
import { SourceChips } from './SourcePopover.js';

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

export function ReportView({ report, warnings, recorded, prompt, onAnnounce }: { report: WeeklyWorkReport; warnings: string[]; recorded: boolean; prompt: string | null; onAnnounce: (msg: string) => void }) {
  const demo = report.mode === 'demo';
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const title = reportTitle(prompt);
  const visible = report.sections.flatMap((s) => s.items).filter((i) => !hidden.has(i.id));
  const observed = visible.filter((i) => i.confidence === 'observed').length;
  const groups = new Map<Source['type'], Source[]>();
  for (const s of report.sources) groups.set(s.type, [...(groups.get(s.type) ?? []), s]);

  const copy = async (format: 'markdown' | 'slack') => {
    const ok = await copyText(exportReport(report, { title, prompt, hidden, format }));
    const msg = ok ? `${format === 'slack' ? 'Slack' : 'Markdown'} 형식으로 복사했습니다${hidden.size ? ` (숨긴 항목 ${hidden.size}개 제외)` : ''}.` : '복사하지 못했습니다. 브라우저가 클립보드 접근을 막았습니다.';
    setCopied(msg);
    onAnnounce(msg);
    setTimeout(() => setCopied(null), 2500);
  };
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <article id="report" aria-labelledby="report-heading" className="surface scroll-mt-20 p-5 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="report-heading" className="text-2xl font-semibold">{title}</h2>
          <p className="tnum mt-1 text-sm text-text-2">{periodKo(report.period)} · 항목 {visible.length}개 중 {observed}개는 출처에서 직접 확인됨</p>
          {prompt && <p className="mt-0.5 text-[13px] text-text-3">질문: {prompt}</p>}
        </div>
        <ModeBadge mode={report.mode} />
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy('slack')} className="hairline inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm text-text hover:brightness-110"><ClipboardCopy className="h-4 w-4" aria-hidden />Slack용 복사</button>
        <button type="button" onClick={() => void copy('markdown')} className="hairline inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-2 hover:text-text">Markdown 복사</button>
        {hidden.size > 0 && <button type="button" onClick={() => setHidden(new Set())} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-sm text-text-2 hover:text-text"><RotateCcw className="h-3.5 w-3.5" aria-hidden />숨긴 항목 {hidden.size}개 되돌리기</button>}
        {copied && <span className="text-sm text-ok">{copied}</span>}
      </div>

      <div className="mt-5"><StatStrip report={report} /></div>

      {demo && <p className="mt-3 text-[13px] text-text-3">{recorded ? '기록된 실행을 재생한 결과입니다. ' : ''}가상의 demo-user 계정의 샘플 데이터로 만든 리포트이며 실제 계정 정보가 아닙니다.</p>}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-3">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok align-middle" aria-hidden />확인됨: 인용한 출처에서 직접 확인한 내용</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-inferred align-middle" aria-hidden />추론: 출처를 바탕으로 판단한 내용 (라벨·키워드 규칙)</span>
      </div>

      {report.sections.map((section) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`} className="mt-7">
          <h3 id={`sec-${section.id}`} className="text-base font-semibold">{sectionTitle(section.id, prompt)}</h3>
          <ul className="mt-2 divide-y divide-line/70">
            {section.items.map((item) => {
              const cited = item.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
              const ok = item.confidence === 'observed';
              const isHidden = hidden.has(item.id);
              return (
                <li key={item.id} className={`group flex items-start gap-3 py-2.5 ${isHidden ? 'opacity-40' : ''}`}>
                  <span className={`mt-[9px] h-2 w-2 shrink-0 rounded-sm ${ok ? 'bg-ok' : 'bg-inferred'}`} role="img" aria-label={ok ? '확인됨' : '추론'} />
                  <p className={`min-w-0 flex-1 text-[15px] leading-relaxed text-text ${isHidden ? 'line-through' : ''}`}>
                    {item.priority && <span className={`pri pri-${item.priority} mr-2 align-[1px]`}>{PRIORITY_KO[item.priority]}</span>}
                    {item.text}{' '}
                    {cited.length > 0 && <SourceChips sources={cited} demo={demo} />}
                  </p>
                  <button type="button" onClick={() => toggle(item.id)} aria-pressed={isHidden} aria-label={isHidden ? '항목 다시 보이기' : '복사할 때 이 항목 빼기'} title={isHidden ? '다시 보이기' : '복사할 때 빼기'} className="shrink-0 rounded-md p-1.5 text-text-3 opacity-60 hover:bg-surface-2 hover:text-text group-hover:opacity-100 focus-visible:opacity-100">
                    {isHidden ? <RotateCcw className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
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
          <summary className="cursor-pointer">실행 메모 {warnings.length}건</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
    </article>
  );
}
