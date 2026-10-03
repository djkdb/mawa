/**
 * What the agent does to third-party data before it reaches an LLM:
 *  - email addresses are masked (role accounts such as noreply@ are kept: they identify a system, not a person)
 *  - personal identifiers are masked: phone numbers, 학번, 주민등록번호, account and card numbers
 *  - text that looks like instructions aimed at the model is flagged, so the run and the UI can show it
 * The user's own UI still shows their data unmasked; only the LLM payload is minimized.
 */
const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const ROLE = /^(no-?reply|notifications?|alerts?|support|security|mailer-daemon|dependabot|calendar-notification)([-.+_][A-Za-z0-9]+)*$/i;

export function maskEmails(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(EMAIL, (all, local: string, domain: string) => {
    if (ROLE.test(local)) return all;
    count += 1;
    return `${local[0] ?? ''}***@${domain}`;
  });
  return { text: out, count };
}

export type PiiKind = 'phone' | 'studentNo' | 'rrn' | 'account' | 'card';
export const PII_LABEL: Record<PiiKind, string> = { phone: '전화번호', studentNo: '학번', rrn: '주민등록번호', account: '계좌번호', card: '카드번호' };

// 010-1234-5678, 010 1234 5678, 01012345678, 043-261-1234. Not preceded/followed by more digits (ids, timestamps).
const PHONE = /(?<![\d-])(01[016789]|0[2-6]\d?)([-. ]?)(\d{3,4})\2(\d{4})(?![\d-])/g;
// A student number is only masked next to the word 학번 (bare 10-digit numbers are too often ids).
const STUDENT_NO = /(학번\s*[:：]?\s*)(\d{8,10})/g;
// 주민등록번호: YYMMDD-Gnnnnnn with a plausible month/day; the hyphen is required (13 bare digits are often timestamps).
const RRN = /(?<![\d-])(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-([1-4])\d{6}(?![\d-])/g;
// 16-digit card numbers in 4-4-4-4 groups that pass the Luhn check.
const CARD = /(?<![\d-])(\d{4})([- ])(\d{4})\2(\d{4})\2(\d{4})(?![\d-])/g;
// Account numbers: 2–4 hyphenated digit groups right after 계좌/입금 (optionally a bank name in between).
const ACCOUNT = /((?:계좌(?:번호)?|입금|지급\s*계좌)\s*[:：]?\s*(?:[가-힣A-Za-z]{1,8}(?:은행)?\s*)?)(\d{2,6}(?:-\d{2,7}){1,3})(?![\d-])/g;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Masks personal identifiers a student's mail actually contains: phone numbers, 학번, 주민등록번호,
 * account and card numbers. Returns the masked text, the total and a count per kind (the "why").
 */
export function maskPii(text: string): { text: string; count: number; kinds: Partial<Record<PiiKind, number>> } {
  const kinds: Partial<Record<PiiKind, number>> = {};
  const hit = (k: PiiKind) => { kinds[k] = (kinds[k] ?? 0) + 1; };
  const out = text
    .replace(RRN, (_a, yy: string, mm: string, dd: string) => { hit('rrn'); return `${yy}${mm}${dd}-*******`; })
    .replace(CARD, (all: string, _a: string, sep: string, _b: string, _c: string, d: string) => {
      if (!luhn(all.replace(/\D/g, ''))) return all;
      hit('card');
      return `****${sep}****${sep}****${sep}${d}`;
    })
    .replace(ACCOUNT, (_a, label: string, n: string) => { hit('account'); return `${label}${n.replace(/\d/g, '*')}`; })
    .replace(PHONE, (_a, p: string, sep: string) => { hit('phone'); return `${p}${sep || '-'}****${sep || '-'}****`; })
    .replace(STUDENT_NO, (_a, label: string, n: string) => { hit('studentNo'); return `${label}${n.slice(0, 2)}********`; });
  const count = Object.values(kinds).reduce((n, x) => n + (x ?? 0), 0);
  return { text: out, count, kinds };
}

const INJECTION: Array<[RegExp, string]> = [
  [/ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i, '이전 지시를 무시하라는 문장'],
  [/disregard (the )?(system|previous) (prompt|instructions)/i, '시스템 지시를 무시하라는 문장'],
  [/\byou are now\b|\bact as\b.*\b(assistant|model|AI)\b/i, '모델의 역할을 바꾸려는 문장'],
  [/(^|\s)(system|assistant)\s*:/i, '대화 역할 표시(system:/assistant:)'],
  [/<\/?(aggregated_context|system|instructions?)>/i, '프롬프트 구분 태그'],
  [/(send|forward|email|post) (all|the|every) .{0,40}(to|at) [^\s]+@/i, '데이터를 외부로 보내라는 문장'],
  [/(이전|위의?) (지시|명령|프롬프트).{0,6}(무시|잊어)/, '이전 지시를 무시하라는 문장'],
];

export function detectInjection(text: string): string | null {
  for (const [re, reason] of INJECTION) if (re.test(text)) return reason;
  return null;
}

/** JSON for embedding inside tag-delimited prompt blocks: `<` and `>` cannot close or open a tag. Still valid JSON. */
export function jsonForPrompt(value: unknown): string {
  return tagSafe(JSON.stringify(value));
}
export function tagSafe(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export interface MaskOptions { emails: boolean; pii: boolean }

/**
 * Masked and tag-safe JSON for an LLM payload. Masking runs first so escapes are never split.
 * `count` is masked email addresses, `pii` other personal identifiers, `piiKinds` the breakdown.
 */
export function promptJson(value: unknown, mask: boolean | MaskOptions = true): { text: string; count: number; pii: number; piiKinds: Partial<Record<PiiKind, number>> } {
  const o = typeof mask === 'boolean' ? { emails: mask, pii: mask } : mask;
  let text = JSON.stringify(value);
  let count = 0;
  let pii = 0;
  let piiKinds: Partial<Record<PiiKind, number>> = {};
  if (o.emails) { const m = maskEmails(text); text = m.text; count = m.count; }
  if (o.pii) { const m = maskPii(text); text = m.text; pii = m.count; piiKinds = m.kinds; }
  return { text: tagSafe(text), count, pii, piiKinds };
}

/** Adds per-kind counts. */
export function addKinds(a: Partial<Record<PiiKind, number>>, b: Partial<Record<PiiKind, number>>): Partial<Record<PiiKind, number>> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b) as Array<[PiiKind, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

const POLICY_FIELDS = ['subject', 'from', 'title', 'snippet', 'message', 'location', 'description', 'repo'];
/** The first exclusion phrase a row matches (case-insensitive substring on its human-readable fields), if any. */
export function excludedBy(row: unknown, exclude: string[]): string | null {
  if (!exclude.length || !row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const text = POLICY_FIELDS.map((k) => (typeof r[k] === 'string' ? (r[k] as string) : '')).join('\n').toLowerCase();
  return exclude.find((p) => text.includes(p.toLowerCase())) ?? null;
}
