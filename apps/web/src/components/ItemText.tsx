import type { ReportItem, Source } from '@mawa/shared';
import { relDay } from '../lib/copy.js';
import { parseItem } from '../lib/item-text.js';

/** The nearest future event/LMS deadline an item cites, as "D-2" / "내일". */
export function ddayOf(item: ReportItem, byId: Map<string, Source>, ref: number): string | null {
  const t = item.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s))
    .filter((s) => (s.metadata['kind'] === 'event' || s.metadata['kind'] === 'due') && s.timestamp && new Date(s.timestamp).getTime() >= ref)
    .map((s) => s.timestamp!).sort()[0];
  return t ? relDay(t, ref) : null;
}

/**
 * A report sentence as a short headline plus a quiet second line: who, what, the ref (#12),
 * the D-day, and the rest (owner, age, a quoted request) in smaller type. Copy/export still use item.text.
 */
export function ItemText({ item, byId, refTime, action = false, compact = false }: { item: ReportItem; byId: Map<string, Source>; refTime: number; action?: boolean; compact?: boolean }) {
  const p = parseItem(item.text, { action });
  const dday = ddayOf(item, byId, refTime) ?? (p.when?.match(/^(D-\d+|오늘|내일)/)?.[1] ?? null);
  const when = p.when?.replace(/^(D-\d+|오늘|내일),?\s*/, '');
  const second = [...p.meta, ...(when ? [when] : [])];
  return (
    <div className="item-text min-w-0">
      <p className={`${compact ? 'line-clamp-2 text-[14px]' : 'text-[15px]'} font-medium leading-snug text-text`}>
        {p.owner && <span className="mr-1.5 inline-flex rounded bg-accent-2/70 px-1.5 align-[1px] text-[11px] font-semibold leading-5 text-text">{p.owner}</span>}
        {dday && <span className="tnum mr-1.5 inline-flex rounded bg-calendar/15 px-1.5 align-[1px] text-[11px] font-semibold leading-5 text-calendar">{dday}</span>}
        {p.ref && <span className="mr-1 font-mono text-[13px] text-text-2">{p.ref}</span>}
        {p.verb && <span className="text-accent">{p.verb} </span>}
        {p.title}
      </p>
      {second.length > 0 && <p className={`mt-0.5 ${compact ? 'truncate' : ''} text-[13px] text-text-3`}>{second.join(' · ')}</p>}
      {p.quote && <p className={`mt-0.5 ${compact ? 'line-clamp-1' : 'line-clamp-2'} text-[13px] text-text-2`}>“{p.quote.text}” <span className="text-text-3">— {p.quote.who}</span></p>}
    </div>
  );
}
