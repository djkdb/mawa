import { useState, type ReactNode } from 'react';
import { CircleDot, Clock, EyeOff, GitCommitHorizontal, GitMerge, GitPullRequest, GitPullRequestClosed, Mail, MapPin, MessageSquare, RotateCcw } from 'lucide-react';
import type { ReportItem, ReportSection, Source, WeeklyWorkReport } from '@mawa/shared';
import { categoryOf, PRIORITY_KO, SERVER_COLOR, SERVER_NAME, WORKSPACE_TZ, relDay } from '../lib/copy.js';
import { ItemText } from './ItemText.js';
import { SourceChips } from './SourcePopover.js';

/**
 * Visual renderers for report sections. Everything drawn here comes from the
 * cited Sources' structured metadata (state, labels, sender, place) that the MCP
 * servers returned; the item text stays the report's own claim and is what
 * gets copied. Items whose sources do not fit a section's layout fall back to
 * the plain sentence row.
 */
export interface BlockCtx {
  report: WeeklyWorkReport;
  byId: Map<string, Source>;
  demo: boolean;
  hidden: Set<string>;
  toggle: (id: string) => void;
  /** "Pick items for the copy" mode: shows the include/exclude control on every item. */
  editing: boolean;
  /** Source ids whose text looked like instructions to the model (from the run's llm_request events). */
  flagged: Map<string, string>;
}

const meta = (s: Source | undefined, k: string): unknown => s?.metadata[k];
const str = (s: Source | undefined, k: string): string | undefined => { const v = meta(s, k); return typeof v === 'string' ? v : undefined; };
const num = (s: Source | undefined, k: string): number | undefined => { const v = meta(s, k); return typeof v === 'number' ? v : undefined; };
const list = (s: Source | undefined, k: string): string[] => { const v = meta(s, k); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; };
const kindOf = (s: Source | undefined) => String(s?.metadata['kind'] ?? '');
const repoShort = (r: string | undefined) => (r ?? '').split('/').pop() ?? '';
const senderName = (from: string | undefined) => (from ?? '').replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || (from ?? '');
const kstDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: WORKSPACE_TZ });
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: WORKSPACE_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function cited(item: ReportItem, byId: Map<string, Source>): Source[] {
  return item.sources.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
}

/** Confidence marker, priority badge and the "leave out of the copy" toggle every item carries. */
function Confidence({ item }: { item: ReportItem }) {
  const ok = item.confidence === 'observed';
  return <span className={`conf ${ok ? 'conf-ok' : 'conf-inf'}`} title={ok ? '확인: 인용한 출처에 그대로 있는 내용' : '추론: 출처를 바탕으로 판단한 내용'}>{ok ? '확인' : '추론'}</span>;
}
/** The one-line basis for a priority or judgement. */
function Reason({ item }: { item: ReportItem }) {
  return item.reason ? <p className="mt-1 text-xs text-text-3"><span className="text-text-2">근거</span> · {item.reason}</p> : null;
}
function CatTag({ item }: { item: ReportItem }) {
  if (!item.category) return null;
  const c = categoryOf(item.category);
  return <span className="inline-flex items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-[18px]" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>{c.label}</span>;
}
function Flag({ src, ctx }: { src: Source[]; ctx: BlockCtx }) {
  const hit = src.find((s) => ctx.flagged.has(s.id));
  return hit ? <span className="inline-flex items-center gap-1 rounded-md bg-caution/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200" title={ctx.flagged.get(hit.id)}>⚠ 지시문 감지 · 데이터로만 처리</span> : null;
}
function Priority({ item }: { item: ReportItem }) {
  return item.priority ? <span className={`pri pri-${item.priority}`}>{PRIORITY_KO[item.priority]}</span> : null;
}
function HideToggle({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  if (!ctx.editing) return null;
  const isHidden = ctx.hidden.has(item.id);
  return (
    <button type="button" onClick={() => ctx.toggle(item.id)} aria-pressed={isHidden} aria-label={isHidden ? '항목 다시 보이기' : '복사할 때 이 항목 빼기'} className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs max-sm:min-h-11 ${isHidden ? 'bg-accent-2 text-text' : 'hairline text-text-2 hover:text-text'}`}>
      {isHidden ? <><RotateCcw className="h-3.5 w-3.5" aria-hidden />넣기</> : <><EyeOff className="h-3.5 w-3.5" aria-hidden />빼기</>}
    </button>
  );
}
function Item({ item, ctx, className = '', children }: { item: ReportItem; ctx: BlockCtx; className?: string; children: ReactNode }) {
  const isHidden = ctx.hidden.has(item.id);
  return <li data-report-item={item.id} className={`group min-w-0 ${isHidden ? 'opacity-40 [&_.item-text]:line-through' : ''} ${className}`}>{children}</li>;
}
function Tag({ children, color }: { children: ReactNode; color?: string | undefined }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-text-2" style={color ? { color } : undefined}>{children}</span>;
}

/** The sentence row: the fallback for any item, and the layout for overview lines. */
function SentenceRow({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const src = cited(item, ctx.byId);
  return (
    <Item item={item} ctx={ctx} className="flex items-start gap-3 py-2.5">
      <span className="mt-[3px]"><Confidence item={item} /></span>
      <div className="min-w-0 flex-1">
        <p className="item-text text-[15px] leading-relaxed text-text">
          {item.priority && <span className="mr-2 align-[1px]"><Priority item={item} /></span>}
          {item.text}{' '}
          {src.length > 0 && <SourceChips sources={src} demo={ctx.demo} />}
        </p>
        <Reason item={item} />
      </div>
      <HideToggle item={item} ctx={ctx} />
    </Item>
  );
}

/* ---------- overview: activity by day and where commits went ---------- */

function OverviewBlock({ section, ctx }: { section: ReportSection; ctx: BlockCtx }) {
  const { report } = ctx;
  const servers = ['github', 'gmail', 'calendar', 'lms'] as const;
  const start = new Date(report.period.start).getTime();
  const days = Array.from({ length: 7 }, (_, i) => kstDay(new Date(start + i * 86_400_000 + 12 * 3_600_000).toISOString()));
  const perDay = new Map(days.map((d) => [d, { github: 0, gmail: 0, calendar: 0, lms: 0 }]));
  for (const s of report.sources) {
    if (!s.timestamp || kindOf(s) === 'repo') continue;
    const bucket = perDay.get(kstDay(s.timestamp));
    if (bucket) bucket[s.type] += 1;
  }
  const max = Math.max(1, ...[...perDay.values()].map((b) => b.github + b.gmail + b.calendar + b.lms));
  const present = servers.filter((sv) => [...perDay.values()].some((b) => b[sv] > 0));
  const repoCounts = new Map<string, number>();
  for (const s of report.sources) if (kindOf(s) === 'commit') { const r = repoShort(str(s, 'repo')) || '기타'; repoCounts.set(r, (repoCounts.get(r) ?? 0) + 1); }
  const repos = [...repoCounts.entries()].sort((a, b) => b[1] - a[1]);
  const commitTotal = repos.reduce((n, [, c]) => n + c, 0);
  const shades = ['var(--color-github)', '#6b7bd6', '#4a5699', '#363f70'];
  const today = kstDay(report.generatedAt);
  const total = (d: string) => { const b = perDay.get(d)!; return b.github + b.gmail + b.calendar + b.lms; };

  return (
    <>
      {present.length > 0 && (
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <figure className="rounded-lg bg-surface-2 p-4">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-text-2">요일별 활동</span>
              <span className="flex gap-3 text-xs text-text-3">{present.map((sv) => <span key={sv} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: SERVER_COLOR[sv] }} aria-hidden />{SERVER_NAME[sv]}</span>)}</span>
            </figcaption>
            <div className="mt-3 grid h-32 grid-cols-7 items-end gap-2" role="img" aria-label={`요일별 활동: ${days.map((d) => `${weekday(d)} ${total(d)}건`).join(', ')}`}>
              {days.map((d) => {
                const b = perDay.get(d)!;
                const future = d > today;
                return (
                  <div key={d} className={`flex h-full flex-col items-center justify-end gap-1 ${future ? 'opacity-60' : ''}`}>
                    <span className="tnum text-[11px] text-text-3">{total(d) ? `${total(d)}${future ? ' 예정' : ''}` : ''}</span>
                    <div className={`flex w-full max-w-9 flex-col-reverse overflow-hidden rounded ${future ? 'outline-1 outline-dashed outline-offset-1 outline-text-3' : ''}`} style={{ height: `${(total(d) / max) * 100}%` }}>
                      {present.map((sv) => b[sv] ? <div key={sv} style={{ flexGrow: b[sv], background: SERVER_COLOR[sv] }} /> : null)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-2 text-center text-xs">
              {days.map((d) => <span key={d} className={d === today ? 'font-semibold text-text' : 'text-text-3'}>{weekday(d)}{d === today ? ' · 오늘' : ''}</span>)}
            </div>
          </figure>
          {repos.length > 0 && (
            <figure className="rounded-lg bg-surface-2 p-4">
              <figcaption className="text-sm font-medium text-text-2">저장소별 커밋 <span className="tnum text-text-3">{commitTotal}개</span></figcaption>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={repos.map(([r, c]) => `${r} ${c}개`).join(', ')}>
                {repos.map(([r, c], i) => <div key={r} style={{ width: `${(c / commitTotal) * 100}%`, background: shades[i % shades.length] }} />)}
              </div>
              <ul className="mt-3 space-y-2">
                {repos.map(([r, c], i) => (
                  <li key={r} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: shades[i % shades.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{r}</span>
                    <span className="tnum text-text-2">{c}개 · {Math.round((c / commitTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </figure>
          )}
        </div>
      )}
      <ul className="mt-2 divide-y divide-line/70">{section.items.map((i) => <SentenceRow key={i.id} item={i} ctx={ctx} />)}</ul>
    </>
  );
}
function weekday(day: string) { return new Date(`${day}T12:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, weekday: 'short' }); }

/* ---------- major activities: one card per repository ---------- */

const COMMIT_TYPE_COLOR: Record<string, string> = { feat: '#34d399', fix: '#fb7185', test: '#c084fc', docs: '#93c5fd', refactor: '#fbbf24', chore: '#94a3b8', solve: '#2dd4bf', perf: '#f472b6', ci: '#94a3b8', style: '#94a3b8', build: '#94a3b8' };

function ActivityCard({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const [open, setOpen] = useState(false);
  const src = cited(item, ctx.byId);
  const commits = src.filter((s) => kindOf(s) === 'commit').sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
  if (!commits.length) return <SentenceRow item={item} ctx={ctx} />;
  const repo = str(commits[0], 'repo') ?? '';
  const add = commits.reduce((n, s) => n + (num(s, 'additions') ?? 0), 0);
  const del = commits.reduce((n, s) => n + (num(s, 'deletions') ?? 0), 0);
  const allCommits = ctx.report.sources.filter((s) => kindOf(s) === 'commit').length || commits.length;
  const types = new Map<string, number>();
  for (const c of commits) { const t = /^(\w+)(\([^)]*\))?!?:/.exec(c.title)?.[1] ?? 'other'; types.set(t, (types.get(t) ?? 0) + 1); }
  const shown = open ? commits : commits.slice(0, 4);
  return (
    <Item item={item} ctx={ctx} className="rounded-lg bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5"><Confidence item={item} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="item-text truncate font-mono text-[15px] font-semibold text-text" title={repo}>{repoShort(repo)}</h4>
            <span className="tnum text-sm text-text-2">커밋 {commits.length}개</span>
            {(add > 0 || del > 0) && <span className="tnum text-xs"><span className="text-ok">+{add.toLocaleString()}</span> <span className="text-gmail">−{del.toLocaleString()}</span></span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden><div className="h-full rounded-full bg-github" style={{ width: `${(commits.length / allCommits) * 100}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => <Tag key={t} color={COMMIT_TYPE_COLOR[t]}>{t} {n}</Tag>)}</div>
        </div>
        <HideToggle item={item} ctx={ctx} />
      </div>
      <ul className="mt-3 space-y-1.5 border-t border-line/70 pt-3 sm:pl-5">
        {shown.map((c) => {
          const m = /^(\w+)(\([^)]*\))?!?:\s*(.*)$/.exec(c.title);
          return (
            <li key={c.id} className="flex items-baseline gap-2 text-sm">
              <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-text-3" aria-hidden />
              {m && <span className="shrink-0 text-xs font-semibold" style={{ color: COMMIT_TYPE_COLOR[m[1]!] ?? 'var(--color-text-2)' }}>{m[1]}{m[2] ? <span className="font-normal text-text-3">{m[2]}</span> : null}</span>}
              <span className="min-w-0 flex-1 truncate text-text" title={c.title}>{m ? m[3] : c.title}</span>
              <span className="hidden shrink-0 font-mono text-[11px] text-text-3 sm:inline">{str(c, 'sha') ?? c.id.split('@')[1]?.slice(0, 7)}</span>
              {c.timestamp && <span className="shrink-0 text-xs text-text-3">{relDay(c.timestamp, new Date(ctx.report.generatedAt).getTime())}</span>}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:pl-5">
        {commits.length > 4 ? <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-8 text-sm text-text-2 hover:text-text">{open ? '접기' : `커밋 ${commits.length - 4}개 더 보기`}</button> : <span />}
        <SourceChips sources={commits} demo={ctx.demo} />
      </div>
    </Item>
  );
}

/* ---------- project progress: PR / issue cards ---------- */

const PR_STATE: Record<string, { label: string; color: string; Icon: typeof GitPullRequest }> = {
  open: { label: '열림', color: '#34d399', Icon: GitPullRequest },
  merged: { label: '병합됨', color: '#c084fc', Icon: GitMerge },
  closed: { label: '닫힘', color: '#94a3b8', Icon: GitPullRequestClosed },
};

function WorkCard({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const src = cited(item, ctx.byId);
  const s = src.find((x) => kindOf(x) === 'pr' || kindOf(x) === 'issue');
  if (!s) return <SentenceRow item={item} ctx={ctx} />;
  const isPr = kindOf(s) === 'pr';
  const state = isPr ? (str(s, 'mergedAt') ? 'merged' : (str(s, 'state') ?? 'open')) : 'issue';
  const st = isPr ? (PR_STATE[state] ?? PR_STATE['open']!) : { label: '열린 이슈', color: '#fbbf24', Icon: CircleDot };
  const comments = num(s, 'reviewComments');
  const extra = item.text.includes(s.title) ? null : item.text;
  return (
    <Item item={item} ctx={ctx} className="flex flex-col rounded-lg bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 14%, transparent)` }}><st.Icon className="h-3.5 w-3.5" aria-hidden />{st.label}</span>
        <span className="tnum font-mono text-sm text-text-2">#{num(s, 'number') ?? s.id.split('#')[1]}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-3">{repoShort(str(s, 'repo'))}</span>
        <Confidence item={item} />
        <HideToggle item={item} ctx={ctx} />
      </div>
      <h4 className="item-text mt-2 text-[15px] font-medium leading-snug text-text">{s.title}</h4>
      {extra && <p className="mt-1 text-sm text-text-2">{extra}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {list(s, 'labels').slice(0, 3).map((l) => <Tag key={l}>{l}</Tag>)}
        {comments !== undefined && <Tag><MessageSquare className="h-3 w-3" aria-hidden />리뷰 코멘트 {comments}</Tag>}
        <span className="ml-auto"><SourceChips sources={src} demo={ctx.demo} /></span>
      </div>
    </Item>
  );
}

/* ---------- schedule: day-grouped timeline ---------- */

function ScheduleBlock({ section, ctx }: { section: ReportSection; ctx: BlockCtx }) {
  const ref = new Date(ctx.report.generatedAt).getTime();
  const rows = section.items.map((item) => ({ item, ev: cited(item, ctx.byId).find((s) => (kindOf(s) === 'event' || kindOf(s) === 'due') && (str(s, 'start') ?? str(s, 'due') ?? s.timestamp)) }));
  const loose = rows.filter((r) => !r.ev);
  const byDay = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => x.ev).sort((a, b) => (str(a.ev, 'start') ?? str(a.ev, 'due') ?? a.ev!.timestamp!).localeCompare(str(b.ev, 'start') ?? str(b.ev, 'due') ?? b.ev!.timestamp!))) {
    const d = kstDay(str(r.ev, 'start') ?? str(r.ev, 'due') ?? r.ev!.timestamp!);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  return (
    <>
      <ol className="mt-3 space-y-3">
        {[...byDay.entries()].map(([day, items]) => {
          const date = new Date(`${day}T12:00:00+09:00`);
          const past = kstDay(new Date(ref).toISOString()) > day;
          return (
            <li key={day} className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 ${past ? 'opacity-60' : ''}`}>
              <div className="pt-1 text-center">
                <div className="tnum text-xl font-semibold leading-none text-text">{date.toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, day: 'numeric' }).replace('일', '')}</div>
                <div className="mt-1 text-xs text-text-3">{date.toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, month: 'short' })} {weekday(day)}</div>
                <div className={`mt-1 text-[11px] font-semibold ${past ? 'text-text-3' : 'text-calendar'}`}>{past ? '지남' : relDay(date.toISOString(), ref)}</div>
              </div>
              <ul className="space-y-2 border-l-2 pl-3" style={{ borderColor: 'color-mix(in srgb, var(--color-calendar) 45%, transparent)' }}>
                {items.map(({ item, ev }) => {
                  const start = str(ev, 'start') ?? str(ev, 'due') ?? ev!.timestamp!;
                  const isLms = kindOf(ev) === 'due';
                  const end = str(ev, 'end');
                  const allDay = meta(ev, 'allDay') === true;
                  // Keep what the sentence adds after the title (submission status, remaining work, a date conflict).
                  const tail = item.text.includes(ev!.title) ? item.text.slice(item.text.indexOf(ev!.title) + ev!.title.length).replace(/^\s*·\s*/, '').replace(/\s*\(.*?\)\s*$/, '').replace(/^·?\s*지남$/, '') : item.text;
                  const extra = tail.trim() || null;
                  return (
                    <Item key={item.id} item={item} ctx={ctx} className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="tnum inline-flex items-center gap-1 text-sm font-semibold" style={{ color: isLms ? 'var(--color-lms)' : 'var(--color-calendar)' }}><Clock className="h-3.5 w-3.5" aria-hidden />{allDay ? '종일' : isLms ? `${hm(start)} 마감` : `${hm(start)}${end ? `–${hm(end)}` : ''}`}</span>
                          <span className="item-text min-w-0 text-[15px] font-medium text-text">{ev!.title}</span>
                        </div>
                        {extra && <p className="mt-0.5 text-sm text-text-2">{extra}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {str(ev, 'location') && <Tag><MapPin className="h-3 w-3" aria-hidden />{str(ev, 'location')}</Tag>}
                          {isLms && <Tag color="var(--color-lms)">eCampus · {str(ev, 'course')}{str(ev, 'action') ? ` · ${str(ev, 'action')}` : ''}</Tag>}
                          <SourceChips sources={[ev!]} demo={ctx.demo} />
                        </div>
                      </div>
                      <span className="mt-1.5"><Confidence item={item} /></span>
                      <HideToggle item={item} ctx={ctx} />
                    </Item>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {loose.length > 0 && <ul className="mt-2 divide-y divide-line/70">{loose.map(({ item }) => <SentenceRow key={item.id} item={item} ctx={ctx} />)}</ul>}
    </>
  );
}

/* ---------- emails: inbox rows ---------- */

const AVATAR = ['#93a4ff', '#fb7185', '#2dd4bf', '#fbbf24', '#c084fc', '#34d399'];
function Avatar({ name }: { name: string }) {
  const h = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const color = AVATAR[h % AVATAR.length]!;
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }} aria-hidden>{[...name.trim()][0]?.toUpperCase() ?? '?'}</span>;
}

function MailRow({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const src = cited(item, ctx.byId);
  const m = src.find((s) => kindOf(s) === 'msg');
  if (!m) return <SentenceRow item={item} ctx={ctx} />;
  const from = senderName(str(m, 'from'));
  const extra = item.text.includes(m.title.replace(/^(Re|Fwd?):\s*/i, '')) ? null : item.text;
  return (
    <Item item={item} ctx={ctx} className="flex items-start gap-3 py-3">
      <Avatar name={from} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-text">{from}</span>
          {item.priority && <Priority item={item} />}
          <span className="ml-auto shrink-0 text-xs text-text-3">{m.timestamp ? new Date(m.timestamp).toLocaleDateString('ko-KR', { timeZone: WORKSPACE_TZ, month: 'short', day: 'numeric' }) : ''}</span>
        </div>
        <div className="item-text truncate text-[15px] text-text" title={m.title}>{m.title}</div>
        {str(m, 'snippet') && <div className="truncate text-sm text-text-3">{str(m, 'snippet')}</div>}
        {extra && <p className="mt-1 text-sm text-text-2">{extra}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><Flag src={[m]} ctx={ctx} />{list(m, 'labels').filter((l) => !/^(INBOX|UNREAD|CATEGORY_)/.test(l)).slice(0, 2).map((l) => <Tag key={l}>{l}</Tag>)}<SourceChips sources={[m]} demo={ctx.demo} /></div>
      </div>
      <span className="mt-1.5"><Confidence item={item} /></span>
      <HideToggle item={item} ctx={ctx} />
    </Item>
  );
}

/* ---------- risks / blockers: priority cards ---------- */

const PRI_COLOR = { high: '#f43f5e', medium: '#f59e0b', low: '#64748b' } as const;

function RiskCard({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const src = cited(item, ctx.byId);
  const s = src[0];
  const k = kindOf(s);
  const Icon = k === 'msg' ? Mail : k === 'pr' ? GitPullRequest : k === 'event' ? Clock : CircleDot;
  const snippet = k === 'msg' ? str(s, 'snippet') : undefined;
  return (
    <Item item={item} ctx={ctx} className="rounded-lg bg-surface-2 p-4">
      <div className="flex items-start gap-3 border-l-[3px] pl-3" style={{ borderColor: PRI_COLOR[item.priority ?? 'low'] }}>
        <Icon className="mt-1 h-4 w-4 shrink-0" style={{ color: s ? SERVER_COLOR[s.type] : undefined }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Priority item={item} /><CatTag item={item} /><Confidence item={item} /><Flag src={src} ctx={ctx} /></div>
          <div className="mt-1"><ItemText item={item} byId={ctx.byId} refTime={new Date(ctx.report.generatedAt).getTime()} /></div>
          {snippet && !item.text.includes(snippet.slice(0, 30)) && <p className="mt-1 line-clamp-2 text-sm text-text-3">{senderName(str(s, 'from'))} · {snippet}</p>}
          <Reason item={item} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {list(s, 'labels').filter((l) => !/^(INBOX|UNREAD|CATEGORY_)/.test(l)).slice(0, 3).map((l) => <Tag key={l}>{l}</Tag>)}
            {num(s, 'reviewComments') ? <Tag><MessageSquare className="h-3 w-3" aria-hidden />{num(s, 'reviewComments')}</Tag> : null}
            {src.length > 1 && <Tag>관련 출처 {src.length}건</Tag>}
            {src.length > 0 && <SourceChips sources={src} demo={ctx.demo} />}
          </div>
        </div>
        <HideToggle item={item} ctx={ctx} />
      </div>
    </Item>
  );
}

/* ---------- next actions: ordered checklist ---------- */

function ActionsBlock({ section, ctx }: { section: ReportSection; ctx: BlockCtx }) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const ref = new Date(ctx.report.generatedAt).getTime();
  const items = [...section.items].sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low']);
  return (
    <ol className="mt-3 grid gap-2">
      {items.map((item, i) => {
        const src = cited(item, ctx.byId);
        return (
          <Item key={item.id} item={item} ctx={ctx} className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
            <span className="tnum mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold" style={{ color: PRI_COLOR[item.priority ?? 'low'], background: `color-mix(in srgb, ${PRI_COLOR[item.priority ?? 'low']} 15%, transparent)` }} aria-hidden>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <ItemText item={item} byId={ctx.byId} refTime={ref} action />
              <Reason item={item} />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Priority item={item} />
                <CatTag item={item} />
                <Confidence item={item} />
                {src.length > 0 && <SourceChips sources={src} demo={ctx.demo} />}
              </div>
            </div>
            <HideToggle item={item} ctx={ctx} />
          </Item>
        );
      })}
    </ol>
  );
}

/** Renders one report section with the layout that fits its data. */
export function SectionBody({ section, ctx }: { section: ReportSection; ctx: BlockCtx }) {
  switch (section.id) {
    case 'overview': return <OverviewBlock section={section} ctx={ctx} />;
    case 'major_activities': return <ul className="mt-3 grid gap-3">{section.items.map((i) => <ActivityCard key={i.id} item={i} ctx={ctx} />)}</ul>;
    case 'project_progress': return <ul className="mt-3 grid gap-3 md:grid-cols-2">{section.items.map((i) => <WorkCard key={i.id} item={i} ctx={ctx} />)}</ul>;
    case 'schedule': return <ScheduleBlock section={section} ctx={ctx} />;
    case 'relevant_emails': return <ul className="mt-1 divide-y divide-line/70">{section.items.map((i) => <MailRow key={i.id} item={i} ctx={ctx} />)}</ul>;
    case 'potential_risks': return <ul className="mt-3 grid gap-2">{[...section.items].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority ?? 'low'] - ({ high: 0, medium: 1, low: 2 })[b.priority ?? 'low']).map((i) => <RiskCard key={i.id} item={i} ctx={ctx} />)}</ul>;
    case 'next_actions': return <ActionsBlock section={section} ctx={ctx} />;
    default: return <ul className="mt-2 divide-y divide-line/70">{(section as ReportSection).items.map((i) => <SentenceRow key={i.id} item={i} ctx={ctx} />)}</ul>;
  }
}
