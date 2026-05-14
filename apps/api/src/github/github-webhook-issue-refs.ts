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

function gatherFromPullRequestLike(pr: unknown, into: Set<number>): void {
  if (!pr || typeof pr !== 'object') {
    return;
  }
  const p = pr as Record<string, unknown>;
  for (const key of ['title', 'body'] as const) {
    const v = p[key];
    if (typeof v === 'string') {
      gatherHashesFromText(v, into);
    }
  }
}

function gatherFromPullRequestsArray(prs: unknown, into: Set<number>): void {
  if (!Array.isArray(prs)) {
    return;
  }
  for (const pr of prs) {
    gatherFromPullRequestLike(pr, into);
  }
}

function gatherFromWorkflowRunLike(run: unknown, into: Set<number>): void {
  if (!run || typeof run !== 'object') {
    return;
  }
  const wr = run as Record<string, unknown>;
  const head = wr.head_commit;
  if (head && typeof head === 'object') {
    const msg = (head as { message?: unknown }).message;
    if (typeof msg === 'string') {
      const lines = msg.split('\n');
      let body = msg;
      if (/^Merge pull request #\d+/i.test(lines[0] ?? '')) {
        body = lines.slice(1).join('\n').trimStart();
      }
      gatherHashesFromText(body, into);
    }
  }
  const displayTitle = wr.display_title;
  if (
    typeof displayTitle === 'string' &&
    !/^Merge pull request #\d+/i.test(displayTitle.trim())
  ) {
    gatherHashesFromText(displayTitle, into);
  }
  gatherFromPullRequestsArray(wr.pull_requests, into);
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
  } else if (eventType === 'workflow_run') {
    gatherFromWorkflowRunLike(body.workflow_run, ids);
  } else if (eventType === 'workflow_job') {
    if (body.workflow_run) {
      gatherFromWorkflowRunLike(body.workflow_run, ids);
    }
    const job = body.workflow_job;
    if (job && typeof job === 'object') {
      const display = (job as { display_title?: unknown }).display_title;
      if (
        typeof display === 'string' &&
        !/^Merge pull request #\d+/i.test(display.trim())
      ) {
        gatherHashesFromText(display, ids);
      }
    }
  } else if (eventType === 'check_suite') {
    gatherFromWorkflowRunLike(body.check_suite, ids);
  } else if (eventType === 'check_run') {
    const cr = body.check_run;
    if (cr && typeof cr === 'object') {
      gatherFromPullRequestsArray(
        (cr as { pull_requests?: unknown }).pull_requests,
        ids,
      );
    }
  } else if (eventType === 'deployment' || eventType === 'deployment_status') {
    const dep =
      eventType === 'deployment_status'
        ? (() => {
            const ds = body.deployment_status;
            if (ds && typeof ds === 'object') {
              return (ds as { deployment?: unknown }).deployment;
            }
            return undefined;
          })()
        : body.deployment;
    if (dep && typeof dep === 'object') {
      const d = dep as Record<string, unknown>;
      for (const key of ['description', 'environment'] as const) {
        const v = d[key];
        if (typeof v === 'string') {
          gatherHashesFromText(v, ids);
        }
      }
    }
  }

  return [...ids];
}

/** Pull request number from webhook payloads (PR events and CI payloads that list `pull_requests`). */
export function extractPullRequestNumber(
  payload: unknown,
  eventType: string,
): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const body = payload as Record<string, unknown>;

  const firstPullNumberFrom = (obj: unknown): number | null => {
    if (!obj || typeof obj !== 'object') {
      return null;
    }
    const prs = (obj as { pull_requests?: unknown }).pull_requests;
    if (!Array.isArray(prs) || prs.length === 0) {
      return null;
    }
    const pr = prs[0];
    if (!pr || typeof pr !== 'object') {
      return null;
    }
    const n = (pr as { number?: unknown }).number;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      return Math.trunc(n);
    }
    if (typeof n === 'string') {
      const parsed = parseInt(n.trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  };

  if (eventType === 'pull_request') {
    const pr = body.pull_request;
    if (!pr || typeof pr !== 'object') {
      return null;
    }
    const n = (pr as { number?: unknown }).number;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      return Math.trunc(n);
    }
    return null;
  }

  if (eventType === 'workflow_run') {
    return firstPullNumberFrom(body.workflow_run);
  }
  if (eventType === 'workflow_job') {
    return firstPullNumberFrom(body.workflow_run);
  }
  if (eventType === 'check_suite') {
    return firstPullNumberFrom(body.check_suite);
  }
  if (eventType === 'check_run') {
    return firstPullNumberFrom(body.check_run);
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
