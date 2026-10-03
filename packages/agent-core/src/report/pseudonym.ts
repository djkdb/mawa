/**
 * Pseudonymization for the LLM: people's names (mail senders, organizers) become stable aliases
 * (사람A, 사람B, …) in everything sent to the model, and the report is restored afterwards, so the
 * user reads real names while the model never sees them. Titles stay readable: 박교수 → 사람B(교수).
 * GitHub logins are left alone (they are already handles, and they appear inside source ids the
 * model must cite exactly).
 */
const NOT_A_PERSON = /팀|학부|학과|봇|앱|스터디|사무실|센터|본부|eCampus|GitHub|Google|채용|공지|알림|support|noreply|bot/i;
const TITLE = /^(.{1,4}?)(교수님?|조교님?|선배|선생님?|님)$/;

function aliasOf(i: number): string {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `사람${s}`;
}

export class Pseudonymizer {
  private names = new Map<string, string>();

  /** Distinct people aliased so far. */
  get size(): number { return this.names.size; }

  /** Learns names from tool rows: the display part of `from` ("김지민 <…>") and `organizer`. */
  learn(rows: unknown): void {
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      for (const f of [r['from'], r['organizer']]) {
        if (typeof f !== 'string') continue;
        const name = f.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
        if (!name || name.includes('@') || NOT_A_PERSON.test(name)) continue;
        // A person's name: 2–5 Hangul syllables (with an optional title) or two Latin words.
        if (!/^[가-힣]{2,5}$/.test(name.replace(/\s/g, '')) && !/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)) continue;
        if (!this.names.has(name)) {
          const t = TITLE.exec(name);
          this.names.set(name, `${aliasOf(this.names.size)}${t ? `(${t[2]})` : ''}`);
        }
      }
    }
  }

  apply(text: string): { text: string; count: number } {
    let out = text;
    let count = 0;
    for (const [name, alias] of [...this.names.entries()].sort((a, b) => b[0].length - a[0].length)) {
      const parts = out.split(name);
      if (parts.length > 1) { count += parts.length - 1; out = parts.join(alias); }
    }
    return { text: out, count };
  }

  restore(text: string): string {
    let out = text;
    for (const [name, alias] of [...this.names.entries()].sort((a, b) => b[1].length - a[1].length)) out = out.split(alias).join(name);
    return out;
  }
}
