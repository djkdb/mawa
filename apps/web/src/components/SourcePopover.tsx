import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Source } from '@mawa/shared';
import { KIND_NAME, SERVER_COLOR, SOURCE_TYPE_NAME, timeKo } from '../lib/copy.js';

function kindOf(s: Source) { return KIND_NAME[String(s.metadata['kind'] ?? s.id.split(':')[1] ?? '')] ?? ''; }

/** Short natural label for a chip, e.g. "PR #14", "Kim Minji 메일", "Demo day 일정". */
export function chipLabel(s: Source): string {
  const k = String(s.metadata['kind'] ?? '');
  if (k === 'pr' || k === 'issue') { const n = s.id.split('#')[1]; return `${k === 'pr' ? 'PR' : '이슈'} #${n}`; }
  if (k === 'commit') return `커밋 ${s.id.split('@')[1]?.slice(0, 7) ?? ''}`;
  if (k === 'repo') return s.title.split('/')[1] ?? s.title;
  if (k === 'msg') return `메일 · ${s.title.replace(/^Re:\s*/i, '').slice(0, 18)}${s.title.length > 18 ? '…' : ''}`;
  if (k === 'event') return `일정 · ${s.title.slice(0, 18)}${s.title.length > 18 ? '…' : ''}`;
  return s.title.slice(0, 20);
}

/** Citation chips after a sentence: up to 2 named chips plus "+N"; click opens the full source record. */
export function SourceChips({ sources, demo }: { sources: Source[]; demo: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = sources.slice(0, 2);
  const rest = sources.slice(2);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {shown.map((s) => <Chip key={s.id} source={s} demo={demo} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />)}
      {rest.length > 0 && <Chip source={rest} demo={demo} label={`+${rest.length}`} ariaLabel={`출처 ${rest.length}개 더 보기`} open={open === '+'} onToggle={() => setOpen(open === '+' ? null : '+')} />}
    </span>
  );
}

function Chip({ source, label, ariaLabel, demo, open, onToggle }: { source: Source | Source[]; label?: string; ariaLabel?: string; demo: boolean; open: boolean; onToggle: () => void }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const list = Array.isArray(source) ? source : [source];
  const [alignRight, setAlignRight] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onToggle(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, onToggle]);
  return (
    <span ref={ref} className="relative inline-block">
      <button type="button" onClick={() => { const r = ref.current?.getBoundingClientRect(); setAlignRight(Boolean(r && r.left > window.innerWidth - 344)); onToggle(); }} aria-expanded={open} aria-controls={id} aria-label={ariaLabel} className={`inline-flex min-h-6 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs transition max-sm:min-h-8 ${open ? 'bg-surface-2 text-text' : 'bg-bg text-text-2 hover:text-text'}`}>
        {!label && <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERVER_COLOR[list[0]!.type] }} aria-hidden />}
        {label ?? chipLabel(list[0]!)}
      </button>
      {open && (
        <span id={id} role="dialog" aria-label="출처" className={`hairline absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-20 mt-1.5 w-80 rounded-lg bg-surface p-3 shadow-lg shadow-black/40 max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:mt-0 max-sm:w-auto`}>
          <ul className="space-y-3">
            {list.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="block font-medium text-text">{s.title}</span>
                <span className="block text-xs text-text-2">{SOURCE_TYPE_NAME[s.type]}{kindOf(s) ? ` · ${kindOf(s)}` : ''}{s.timestamp ? ` · ${timeKo(s.timestamp)}` : ''}</span>
                <span className="block break-all font-mono text-[11px] text-text-3">{s.id}</span>
                {demo ? (
                  <span className="mt-1 block text-xs text-text-3">샘플 데이터 · 원본 없음</span>
                ) : s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-6 items-center gap-1 text-xs text-accent hover:underline">원본 열기 <ExternalLink className="h-3 w-3" aria-hidden /></a>
                ) : null}
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}
