import { PROJECT } from '@mawa/shared';

export const LINKS = {
  github: PROJECT.author.github,
  instagram: PROJECT.author.instagram.url,
  instagramHandle: PROJECT.author.instagram.handle,
  email: (import.meta.env['VITE_CONTACT_EMAIL'] as string | undefined) ?? '',
  liveApp: (import.meta.env['VITE_LIVE_APP_URL'] as string | undefined) ?? 'http://localhost:5173',
  /** The portfolio's own public URL for the QR code; falls back to the current location. */
  portfolio: (import.meta.env['VITE_PORTFOLIO_URL'] as string | undefined) ?? (typeof window !== 'undefined' ? window.location.origin : ''),
};
