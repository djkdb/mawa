import { google } from 'googleapis';

/**
 * Builds an OAuth2 client from environment. apps/api passes a short-lived
 * access token (and optionally a refresh token) when spawning this server.
 * For local experiments a token obtained from the OAuth Playground also works.
 */
export function googleAuthFromEnv(env = process.env) {
  const accessToken = env['GOOGLE_ACCESS_TOKEN'];
  const refreshToken = env['GOOGLE_REFRESH_TOKEN'];
  if (!accessToken && !refreshToken) {
    throw new Error('GOOGLE_ACCESS_TOKEN or GOOGLE_REFRESH_TOKEN is required in real mode');
  }
  const auth = new google.auth.OAuth2(env['GOOGLE_CLIENT_ID'], env['GOOGLE_CLIENT_SECRET']);
  auth.setCredentials({
    ...(accessToken ? { access_token: accessToken } : {}),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  });
  return auth;
}
