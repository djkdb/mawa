/**
 * Recording mode (`?record=1`, until `?record=0`): hides who is signed in — account names and
 * e-mails on the connection cards, workspace and avatar — so a screen recording can be shared.
 * Report content (commit and PR titles) is left as it is: that is what the recording shows.
 * Kept in sessionStorage so it survives the OAuth round trip, which drops the query string.
 */
const KEY = 'mawa.record';

function read(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('record');
    if (q === '1') sessionStorage.setItem(KEY, '1');
    if (q === '0') sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === '1' || q === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('record') === '1';
  }
}

export const RECORDING = typeof window !== 'undefined' && read();

/** What to show instead of an account identifier while recording. */
export function accountLabel(account: string | null | undefined): string | null {
  if (!account) return account ?? null;
  return RECORDING ? '내 계정' : account;
}
