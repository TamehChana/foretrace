import { apiUrl } from './api-url';

/** Fetch with session cookies (dev proxy or `VITE_API_URL` production). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: 'include' });
}
