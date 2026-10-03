import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mawa-theme';
const media = () => window.matchMedia('(prefers-color-scheme: light)');

function read(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

function apply(pref: ThemePref) {
  const theme = pref === 'system' ? (media().matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6fa' : '#0b0d12');
}

/** Theme preference (system / light / dark), saved per browser; index.html applies it before first paint. */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const m = media();
    const on = () => apply('system');
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [pref]);
  const set = (p: ThemePref) => { try { localStorage.setItem(KEY, p); } catch { /* private mode */ } setPref(p); };
  return [pref, set];
}
