/**
 * Collect GitHub issue numbers mentioned in webhook payloads so linked Foretrace
 * tasks (`githubIssueNumber`) can record activity.
 */
function gatherHashesFromText(text: string, into: Set<number>): void {
  const re = /#(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1] ?? '', 10);
    if (Number.isFinite(n) && n > 0 && n < 500_000_000) {
      into.add(n);
    }
  }
}

export function collectIssueReferencesFromGithubWebhook(
  payload: unknown,
  eventType: string,
): number[] {
  const ids = new Set<number>();
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const body = payload as Record<string, unknown>;

  if (eventType === 'push') {
    const commits = body.commits;
    if (Array.isArray(commits)) {
      for (const c of commits) {
        if (c && typeof c === 'object') {
          const msg = (c as { message?: unknown }).message;
          if (typeof msg === 'string') {
            gatherHashesFromText(msg, ids);
          }
        }
      }
    }
    const head = body.head_commit;
    if (head && typeof head === 'object') {
      const msg = (head as { message?: unknown }).message;
      if (typeof msg === 'string') {
        gatherHashesFromText(msg, ids);
      }
    }
  } else if (eventType === 'pull_request') {
    const pr = body.pull_request;
    if (pr && typeof pr === 'object') {
      const p = pr as Record<string, unknown>;
      for (const key of ['title', 'body'] as const) {
        const v = p[key];
        if (typeof v === 'string') {
          gatherHashesFromText(v, ids);
        }
      }
    }
  } else if (eventType === 'issues' || eventType === 'issue_comment') {
    const issue = body.issue;
    if (issue && typeof issue === 'object') {
      const num = (issue as { number?: unknown }).number;
      if (typeof num === 'number' && Number.isFinite(num) && num > 0) {
        ids.add(Math.trunc(num));
      } else if (typeof num === 'string') {
        const parsed = parseInt(num.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          ids.add(parsed);
        }
      }
      const title = (issue as { title?: unknown }).title;
      if (typeof title === 'string') {
        gatherHashesFromText(title, ids);
      }
      const b = (issue as { body?: unknown }).body;
      if (typeof b === 'string') {
        gatherHashesFromText(b, ids);
      }
    }
    const comment = body.comment;
    if (comment && typeof comment === 'object') {
      const cb = (comment as { body?: unknown }).body;
      if (typeof cb === 'string') {
        gatherHashesFromText(cb, ids);
      }
    }
  }

  return [...ids];
}

/** Pull request number from `pull_request` webhook payloads. */
export function extractPullRequestNumber(
  payload: unknown,
  eventType: string,
): number | null {
  if (eventType !== 'pull_request') {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const pr = (payload as Record<string, unknown>).pull_request;
  if (!pr || typeof pr !== 'object') {
    return null;
  }
  const n = (pr as { number?: unknown }).number;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.trunc(n);
  }
  return null;
}

export function summarizeGithubWebhookTouch(
  eventType: string,
  action: string | undefined,
  issueNums: number[],
  pullRequestNumber: number | null,
): string {
  const sorted = [...issueNums].sort((a, b) => a - b);
  const issuePart =
    sorted.length > 0
      ? `issues #${sorted.slice(0, 8).join(', #')}${
          sorted.length > 8 ? '…' : ''
        }`
      : '';
  const bits = [eventType];
  if (action) {
    bits.push(action);
  }
  let out = bits.join(':');
  if (issuePart) {
    out += ` · ${issuePart}`;
  }
  if (pullRequestNumber != null) {
    out += ` · PR #${pullRequestNumber}`;
  }
  return out.length > 500 ? `${out.slice(0, 497)}…` : out;
}
