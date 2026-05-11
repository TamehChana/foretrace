import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER_JSON = JSON.stringify({ alg: 'HS256', typ: 'FT' });
/** Wall-clock lifetime for SPA bearer tokens (session cookie parallel). */
const ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toB64u(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function fromB64u(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8');
}

function signSegmentPair(headerB64: string, payloadB64: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
}

/**
 * HS256-style signed token: `base64url(header).base64url(payload).signature`.
 * Payload includes `sub` (user id) and `exp` (epoch ms).
 */
export function signAccessToken(userId: string, secret: string): string {
  const now = Date.now();
  const payload = JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + ACCESS_TTL_MS,
  });
  const headerB64 = toB64u(HEADER_JSON);
  const payloadB64 = toB64u(payload);
  const sig = signSegmentPair(headerB64, payloadB64, secret);
  return `${headerB64}.${payloadB64}.${sig}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
): { sub: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, sig] = parts;
  if (!headerB64 || !payloadB64 || !sig) {
    return null;
  }
  const expected = signSegmentPair(headerB64, payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(fromB64u(payloadB64));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || !('sub' in payload)) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const sub = p.sub;
  const exp = p.exp;
  if (typeof sub !== 'string' || sub.length === 0) {
    return null;
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp) || Date.now() > exp) {
    return null;
  }
  return { sub };
}

export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return null;
  }
  const t = authorization.slice('Bearer '.length).trim();
  return t.length > 0 ? t : null;
}
