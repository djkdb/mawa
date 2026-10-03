/**
 * What the agent does to third-party data before it reaches an LLM:
 *  - email addresses are masked (role accounts such as noreply@ are kept: they identify a system, not a person)
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

/** Masked and tag-safe JSON for an LLM payload. Masking runs first so escapes are never split. */
export function promptJson(value: unknown): { text: string; count: number } {
  const m = maskEmails(JSON.stringify(value));
  return { text: tagSafe(m.text), count: m.count };
}
