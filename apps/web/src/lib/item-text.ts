/**
 * Splits a report sentence into the parts a card shows separately, so the headline stays short:
 *   "나 · 이슈 #12 마무리: ERD 확정 — 10월 5일 (월) "캡스톤 팀 회의" 전"
 *   → owner "나", ref "#12", verb "마무리", title "ERD 확정", when "10월 5일 (월) "캡스톤 팀 회의" 전"
 * Pure presentation: the sentence itself (what gets copied) is unchanged.
 */
export interface ItemParts {
  owner?: string;
  ref?: string;
  verb?: string;
  title: string;
  /** Secondary facts: "담당 나", "이번 주 열림", … */
  meta: string[];
  quote?: { who: string; text: string };
  when?: string;
}

export function parseItem(text: string, opts: { action?: boolean } = {}): ItemParts {
  let t = text.trim();
  // Schedule line: "10월 5일 (월) 오후 06:00 · 캡스톤 팀 회의 (S4-1 팀플실) · 지남" → title + time/place.
  const ev = /^(\d{1,2}월 \d{1,2}일 \([^)]+\) (?:오전|오후) \d{1,2}:\d{2}) · (.+?)(?: \(([^()]+)\))?( · 지남)?$/.exec(t);
  if (ev && !opts.action) return { title: ev[2]!, meta: [ev[1]!.replace(/^\d{1,2}월 \d{1,2}일 /, ''), ...(ev[3] ? [ev[3]] : []), ...(ev[4] ? ['지남'] : [])] };
  let owner: string | undefined;
  if (opts.action) {
    const om = /^([^·—]{1,16}) · (.+)$/.exec(t);
    if (om && !/^(이슈|PR) #/.test(om[1]!)) { owner = om[1]!.trim(); t = om[2]!; }
  }
  let when: string | undefined;
  const pm = /\s*\(((?:D-\d+|오늘|내일)[^()]*(?:\([^)]*\))?[^()]*)\)\s*$/.exec(t);
  if (pm) { when = pm[1]!.trim(); t = t.slice(0, pm.index); }
  const [head = '', ...rest] = t.split(' — ');
  let tail = rest.join(' — ');
  if (!when && / 전$/.test(tail) && !tail.includes(' · ')) { when = tail; tail = ''; }
  let quote: ItemParts['quote'];
  const qm = /(?:^|·\s*)([^·“]*?):\s*“([^”]+)”/.exec(tail);
  if (qm) { quote = { who: qm[1]!.trim(), text: qm[2]!.trim() }; tail = tail.replace(qm[0], ''); }
  const meta = tail.split(' · ').map((s) => s.trim()).filter(Boolean);
  let title = head.trim();
  let ref: string | undefined;
  const rm = /^(이슈|PR) #(\d+)\s*(.*)$/.exec(title);
  if (rm) { ref = `${rm[1] === 'PR' ? 'PR ' : ''}#${rm[2]}`; title = rm[3]!.trim(); }
  let verb: string | undefined;
  if (opts.action) {
    const vm = /^([^:]{1,22}):\s*(.+)$/.exec(title);
    if (vm) { verb = vm[1]!.trim(); title = vm[2]!.trim(); }
  }
  return { ...(owner ? { owner } : {}), ...(ref ? { ref } : {}), ...(verb ? { verb } : {}), title, meta, ...(quote ? { quote } : {}), ...(when ? { when } : {}) };
}
