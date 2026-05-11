/** SessionStorage key for API bearer token (cross-origin when cookies are blocked). */
export const FORETRACE_ACCESS_TOKEN_KEY = 'foretrace.accessToken';

export function getAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    return sessionStorage.getItem(FORETRACE_ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  try {
    sessionStorage.setItem(FORETRACE_ACCESS_TOKEN_KEY, token);
  } catch {
    /* quota / private mode */
  }
}

export function clearAccessToken(): void {
  try {
    sessionStorage.removeItem(FORETRACE_ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
