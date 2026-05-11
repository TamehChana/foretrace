import { apiUrl } from './api-url';
import { getAccessToken } from './auth-token';

/** Fetch with session cookies (dev proxy or `VITE_API_URL` production). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const merged: RequestInit = { credentials: 'include', ...init };
  const method = (merged.method ?? 'GET').toUpperCase();
  if (method === 'GET' && merged.cache === undefined) {
    merged.cache = 'no-store';
  }
  const headers = new Headers(merged.headers);
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  merged.headers = headers;
  return fetch(apiUrl(path), merged);
}
