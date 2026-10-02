import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Source } from '@mawa/shared';

export const SOURCE_LABEL: Record<Source['type'], string> = { github: 'GitHub', gmail: 'Gmail', calendar: 'Google Calendar' };

/** A citation. Clicking reveals the full source record (title, type, timestamp, url, id). */
export function SourceChip({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fog hover:border-accent/60 hover:text-white">
        Source: {SOURCE_LABEL[source.type]}
      </button>
      {open && (
        <span id={id} role="dialog" aria-label="Source details" className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-line bg-navy p-3 text-xs shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:mt-0 max-sm:w-auto">
          <span className="block font-medium text-white">{source.title}</span>
          <span className="mt-1 block font-mono text-[10px] text-fog">{SOURCE_LABEL[source.type]}{source.timestamp ? ` · ${new Date(source.timestamp).toLocaleString()}` : ''}</span>
          <span className="mt-1 block break-all font-mono text-[10px] text-fog/80">{source.id}</span>
          {source.url && (
            <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent hover:underline">
              open <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </span>
      )}
    </span>
  );
}
