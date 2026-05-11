function messageFromParsedBody(body: unknown, httpStatus: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
    if (Array.isArray(m) && m.every((x) => typeof x === 'string')) {
      return m.join(' ');
    }
  }
  return `Request failed (${httpStatus})`;
}

/**
 * Use when the response body was already read as JSON (or `null` on parse failure).
 */
export function formatApiErrorResponse(
  body: unknown,
  httpStatus: number,
): string {
  return messageFromParsedBody(body, httpStatus);
}

/**
 * Use when `res` has not been consumed yet (e.g. early `if (!res.ok)` before `json()`).
 */
export async function readApiErrorMessage(res: Response): Promise<string> {
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
  return messageFromParsedBody(body, res.status);
}
