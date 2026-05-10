/** Extracts a human-readable message from a Nest/HTTP JSON error body. */
export async function formatApiErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    const trimmed = text.trim();
    return trimmed.length > 0
      ? trimmed.slice(0, 400)
      : `Request failed (${res.status})`;
  }
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
    if (Array.isArray(m) && m.every((x) => typeof x === 'string')) {
      return m.join(' ');
    }
  }
  return `Request failed (${res.status})`;
}
