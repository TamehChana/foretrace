import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(): Buffer | null {
  const secret = process.env.FORETRACE_APP_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return null;
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** Returns null if `FORETRACE_APP_SECRET` is unset or too short (min 16 chars). */
export function encryptForStorage(plaintext: string): string | null {
  const key = deriveKey();
  if (!key) {
    return null;
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptFromStorage(stored: string): string | null {
  const key = deriveKey();
  if (!key) {
    return null;
  }
  try {
    const buf = Buffer.from(stored, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      return null;
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    return null;
  }
}

export function isSecretConfigured(): boolean {
  return deriveKey() !== null;
}
