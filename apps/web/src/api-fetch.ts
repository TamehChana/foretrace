import { apiUrl } from './api-url';

/** Fetch with session cookies (dev proxy or `VITE_API_URL` production). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const merged: RequestInit = { credentials: 'include', ...init };
  const method = (merged.method ?? 'GET').toUpperCase();
  if (method === 'GET' && merged.cache === undefined) {
    merged.cache = 'no-store';
  }
  return fetch(apiUrl(path), merged);
}
