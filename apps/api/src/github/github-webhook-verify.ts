import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validates `X-Hub-Signature-256` for a GitHub webhook delivery (SHA-256 HMAC of raw body).
 */
export function verifyGitHubSignature256(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (
    typeof signatureHeader !== 'string' ||
    !signatureHeader.startsWith('sha256=')
  ) {
    return false;
  }
  const theirs = signatureHeader.slice('sha256='.length).trim();
  const ours = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(theirs, 'hex'), Buffer.from(ours, 'hex'));
  } catch {
    return false;
  }
}

export function normalizeRepositoryFullName(name: string): string {
  return name.trim().toLowerCase();
}

export function repositoryFullNameFromPayload(
  payload: unknown,
  eventType: string,
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as Record<string, unknown>;

  const fromRepoObj = (repo: unknown): string | null => {
    if (!repo || typeof repo !== 'object') {
      return null;
    }
    const fn = (repo as { full_name?: unknown }).full_name;
    if (typeof fn === 'string' && fn.length > 0) {
      return normalizeRepositoryFullName(fn);
    }
    return null;
  };

  const direct = fromRepoObj(body.repository);
  if (direct) {
    return direct;
  }

  if (eventType === 'fork' && body.forkee) {
    return fromRepoObj(body.forkee);
  }

  return null;
}

export function extractActorLogin(
  payload: unknown,
  eventType: string,
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as Record<string, unknown>;
  const login = (o: unknown): string | null => {
    if (!o || typeof o !== 'object') {
      return null;
    }
    const v = (o as { login?: unknown }).login;
    return typeof v === 'string' ? v.toLowerCase() : null;
  };

  switch (eventType) {
    case 'push': {
      const p = body.pusher;
      if (!p || typeof p !== 'object') {
        return null;
      }
      const name = (p as { name?: unknown }).name;
      return typeof name === 'string' ? name.toLowerCase() : null;
    }
    case 'pull_request':
    case 'pull_request_review':
      return login(body.sender);
    case 'issues':
    case 'issue_comment':
      return login(body.sender);
    case 'create':
    case 'delete':
      return login(body.sender);
    default:
      return login(body.sender);
  }
}

export function extractAction(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const body = payload as Record<string, unknown>;
  const a = body.action;
  return typeof a === 'string' ? a : undefined;
}
