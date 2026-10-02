import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Source, WeeklyWorkReport } from '@mawa/shared';
import { KIND_NAME, SECTION_TITLE, SOURCE_TYPE_NAME, dateKo, timeKo } from '../lib/copy.js';
import { ModeBadge } from './ModeBadge.js';
import { SourceChips } from './SourcePopover.js';

export function ReportView({ report, warnings, recorded }: { report: WeeklyWorkReport; warnings: string[]; recorded: boolean }) {
  const byId = new Map(report.sources.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const s of report.sources) { const k = String(s.metadata['kind'] ?? ''); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const stats = ['commit', 'pr', 'issue', 'event', 'msg'].filter((k) => counts.has(k));
  const total = report.sections.reduce((n, s) => n + s.items.length, 0);
  const observed = report.sections.reduce((n, s) => n + s.items.filter((i) => i.confidence === 'observed').length, 0);
  const [showSources, setShowSources] = useState(false);
  const groups = new Map<Source['type'], Source[]>();
  for (const s of report.sources) groups.set(s.type, [...(groups.get(s.type) ?? []), s]);

  return (
    <article aria-labelledby="report-heading" className="surface p-5 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="report-heading" className="text-2xl font-semibold">주간 업무 리포트</h2>
          <p className="tnum mt-1 text-sm text-text-2">{dateKo(report.period.start)} – {dateKo(report.period.end)} · 항목 {total}개 중 {observed}개는 출처에서 직접 확인됨</p>
        </div>
        <ModeBadge mode={report.mode} />
      </header>

      {stats.length > 0 && (
        <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-5">
          {stats.map((k) => (
            <div key={k} className="bg-surface-2 px-4 py-3">
              <dt className="text-xs text-text-3">{KIND_NAME[k]}</dt>
              <dd className="tnum text-2xl font-semibold text-text">{counts.get(k)}</dd>
            </div>
          ))}
        </dl>
      )}

      {report.mode === 'demo' && (
        <p className="mt-3 text-[13px] text-text-3">{recorded ? '기록된 실행을 재생한 결과입니다. ' : ''}가상의 demo-user 계정의 샘플 데이터로 만든 리포트이며 실제 계정 정보가 아닙니다.</p>
      )}

      <div className="mt-2 flex gap-4 text-xs text-text-3">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok align-middle" aria-hidden />확인됨: 인용한 출처에서 직접 확인한 내용</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-inferred align-middle" aria-hidden />추론: 출처를 바탕으로 에이전트가 판단한 내용</span>
      </div>

      {report.sections.map((section) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`} className="mt-7">
          <h3 id={`sec-${section.id}`} className="text-base font-semibold">{SECTION_TITLE[section.id]}</h3>
          <ul className="mt-2 divide-y divide-line/70">
            {section.items.map((item) => {
              const cited = item.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
              const ok = item.confidence === 'observed';
              return (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <span className={`mt-[9px] h-2 w-2 shrink-0 rounded-sm ${ok ? 'bg-ok' : 'bg-inferred'}`} role="img" aria-label={ok ? '확인됨' : '추론'} />
                  <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-text">
                    {item.text}{' '}
                    {cited.length > 0 && <SourceChips sources={cited} />}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="mt-8 border-t border-line pt-4">
        <button type="button" onClick={() => setShowSources((o) => !o)} aria-expanded={showSources} aria-controls="sources-body" className="flex w-full items-center justify-between gap-3 text-left">
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
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-text hover:underline" title={s.title}>{s.title}</a> : <span className="block truncate text-text" title={s.title}>{s.title}</span>}
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
