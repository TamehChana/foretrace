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

/**
 * Resolves `owner/repo` from a GitHub REST-style repository object.
 * Prefer `full_name`; some payloads only send `name` + `owner.login`.
 */
export function fullNameFromRepositoryLike(repo: unknown): string | null {
  if (!repo || typeof repo !== 'object') {
    return null;
  }
  const r = repo as Record<string, unknown>;
  const fn = r.full_name;
  if (typeof fn === 'string' && fn.trim().length > 0) {
    return normalizeRepositoryFullName(fn);
  }
  const name = r.name;
  const owner = r.owner;
  if (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    owner &&
    typeof owner === 'object'
  ) {
    const login = (owner as { login?: unknown }).login;
    if (typeof login === 'string' && login.trim().length > 0) {
      return normalizeRepositoryFullName(`${login.trim()}/${name.trim()}`);
    }
  }
  return null;
}

function nestedRepo(body: Record<string, unknown>, key: string): unknown {
  const v = body[key];
  if (!v || typeof v !== 'object') {
    return undefined;
  }
  const r = v as Record<string, unknown>;
  return r.repository;
}

export function repositoryFullNameFromPayload(
  payload: unknown,
  eventType: string,
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as Record<string, unknown>;

  const candidates: unknown[] = [
    body.repository,
    nestedRepo(body, 'workflow_run'),
    nestedRepo(body, 'workflow_job'),
    nestedRepo(body, 'check_suite'),
    nestedRepo(body, 'check_run'),
    nestedRepo(body, 'deployment'),
    nestedRepo(body, 'deployment_status'),
    nestedRepo(body, 'status'),
    nestedRepo(body, 'issue_comment'),
    nestedRepo(body, 'pull_request'),
  ];

  for (const c of candidates) {
    const resolved = fullNameFromRepositoryLike(c);
    if (resolved) {
      return resolved;
    }
  }

  if (eventType === 'fork' && body.forkee) {
    return fullNameFromRepositoryLike(body.forkee);
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
      const fromSender = login(body.sender);
      if (fromSender) {
        return fromSender;
      }
      const commits = body.commits;
      if (Array.isArray(commits)) {
        for (const c of commits) {
          if (!c || typeof c !== 'object') {
            continue;
          }
          const author = (c as { author?: unknown }).author;
          if (author && typeof author === 'object') {
            const u = (author as { username?: unknown }).username;
            if (typeof u === 'string' && u.trim().length > 0) {
              return u.toLowerCase();
            }
          }
        }
      }
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
