/**
 * What the agent does to third-party data before it reaches an LLM:
 *  - email addresses are masked (role accounts such as noreply@ are kept: they identify a system, not a person)
 *  - Korean phone numbers and student numbers (학번) are masked
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

// 010-1234-5678, 010 1234 5678, 01012345678, 043-261-1234. Not preceded/followed by more digits (ids, timestamps).
const PHONE = /(?<![\d-])(01[016789]|0[2-6]\d?)([-. ]?)(\d{3,4})\2(\d{4})(?![\d-])/g;
// A student number is only masked next to the word 학번 (bare 10-digit numbers are too often ids).
const STUDENT_NO = /(학번\s*[:：]?\s*)(\d{8,10})/g;

/** Masks phone numbers (keeps the prefix: 010-****-5678 → 010-****-****) and 학번 values. */
export function maskPhones(text: string): { text: string; count: number } {
  let count = 0;
  const out = text
    .replace(PHONE, (_all, a: string, sep: string) => { count += 1; return `${a}${sep || '-'}****${sep || '-'}****`; })
    .replace(STUDENT_NO, (_all, label: string, n: string) => { count += 1; return `${label}${n.slice(0, 2)}********`; });
  return { text: out, count };
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

export interface MaskOptions { emails: boolean; phones: boolean }

/**
 * Masked and tag-safe JSON for an LLM payload. Masking runs first so escapes are never split.
 * `count` is masked email addresses, `phones` masked phone/student numbers.
 */
export function promptJson(value: unknown, mask: boolean | MaskOptions = true): { text: string; count: number; phones: number } {
  const o = typeof mask === 'boolean' ? { emails: mask, phones: mask } : mask;
  let text = JSON.stringify(value);
  let count = 0;
  let phones = 0;
  if (o.emails) { const m = maskEmails(text); text = m.text; count = m.count; }
  if (o.phones) { const m = maskPhones(text); text = m.text; phones = m.count; }
  return { text: tagSafe(text), count, phones };
}

const POLICY_FIELDS = ['subject', 'from', 'title', 'snippet', 'message', 'location', 'description', 'repo'];
/** The first exclusion phrase a row matches (case-insensitive substring on its human-readable fields), if any. */
export function excludedBy(row: unknown, exclude: string[]): string | null {
  if (!exclude.length || !row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const text = POLICY_FIELDS.map((k) => (typeof r[k] === 'string' ? (r[k] as string) : '')).join('\n').toLowerCase();
  return exclude.find((p) => text.includes(p.toLowerCase())) ?? null;
}
