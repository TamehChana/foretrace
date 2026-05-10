/**
 * Resolves URLs for the Nest API. When `VITE_API_URL` is unset, paths are relative
 * so dev can use Vite proxy (see vite.config.ts). Production builds on Vercel must set `VITE_API_URL`.
 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return raw ? `${raw}${p}` : p;
}
