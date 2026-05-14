import {
  collectIssueReferencesFromGithubWebhook,
  extractPullRequestNumber,
  extractWorkflowRunConclusion,
  isPullRequestMergedClose,
  summarizeGithubWebhookTouch,
} from './github-webhook-issue-refs';

describe('github-webhook-issue-refs', () => {
  describe('extractPullRequestNumber', () => {
    it('returns null for events without PR linkage', () => {
      expect(
        extractPullRequestNumber(
          { pull_request: { number: 12 } },
          'push',
        ),
      ).toBeNull();
    });

    it('returns null when payload is not an object', () => {
      expect(extractPullRequestNumber(null, 'pull_request')).toBeNull();
      expect(extractPullRequestNumber('x', 'pull_request')).toBeNull();
    });

    it('returns null when pull_request is missing', () => {
      expect(extractPullRequestNumber({ action: 'opened' }, 'pull_request')).toBeNull();
    });

    it('returns truncated positive integer from pull_request.number', () => {
      expect(
        extractPullRequestNumber(
          { pull_request: { number: 42 } },
          'pull_request',
        ),
      ).toBe(42);
    });

    it('returns null for non-numeric pull_request.number', () => {
      expect(
        extractPullRequestNumber(
          { pull_request: { number: '7' } },
          'pull_request',
        ),
      ).toBeNull();
    });

    it('returns first PR number from workflow_run.pull_requests', () => {
      expect(
        extractPullRequestNumber(
          {
            workflow_run: {
              pull_requests: [{ number: 8, title: 'x', body: null }],
            },
          },
          'workflow_run',
        ),
      ).toBe(8);
    });

    it('returns first PR number from check_run.pull_requests', () => {
      expect(
        extractPullRequestNumber(
          {
            check_run: {
              pull_requests: [{ number: 3, title: 't', body: null }],
            },
          },
          'check_run',
        ),
      ).toBe(3);
    });
  });

  describe('summarizeGithubWebhookTouch', () => {
    it('joins event, action, issues, and PR', () => {
      expect(
        summarizeGithubWebhookTouch(
          'pull_request',
          'opened',
          [99, 1],
          12,
        ),
      ).toBe('pull_request:opened · issues #1, #99 · PR #12');
    });

    it('omits action and PR when absent', () => {
      expect(summarizeGithubWebhookTouch('push', undefined, [5], null)).toBe(
        'push · issues #5',
      );
    });

    it('truncates to 500 characters with ellipsis', () => {
      const longEvent = 'e'.repeat(520);
      const out = summarizeGithubWebhookTouch(
        longEvent,
        'opened',
        [1],
        null,
      );
      expect(out.length).toBe(498);
      expect(out.endsWith('…')).toBe(true);
    });
  });

  describe('collectIssueReferencesFromGithubWebhook', () => {
    it('parses issue number when GitHub sends it as a string', () => {
      const nums = collectIssueReferencesFromGithubWebhook(
        {
          issue: { number: '7', title: 'x', body: null },
        },
        'issues',
      );
      expect(nums).toContain(7);
    });

    it('collects hashes from push commit messages', () => {
      const nums = collectIssueReferencesFromGithubWebhook(
        {
          commits: [{ message: 'Fix crash (#44) and see #45' }],
        },
        'push',
      );
      expect(nums.sort((a, b) => a - b)).toEqual([44, 45]);
    });

    it('collects issue refs from workflow_run PR titles and merge commit body', () => {
      const nums = collectIssueReferencesFromGithubWebhook(
        {
          workflow_run: {
            head_commit: {
              message:
                'Merge pull request #1 from org/fix\n\nCloses #77 and relates to #78',
            },
            display_title: 'Merge pull request #1 from org/fix',
            pull_requests: [
              { number: 1, title: 'Fix widget (#88)', body: 'See also #89' },
            ],
          },
        },
        'workflow_run',
      );
      const sorted = [...nums].sort((a, b) => a - b);
      expect(sorted).toEqual([77, 78, 88, 89]);
    });
  });

  describe('isPullRequestMergedClose and extractWorkflowRunConclusion', () => {
    it('detects merged PR close', () => {
      expect(
        isPullRequestMergedClose(
          { action: 'closed', pull_request: { merged: true, number: 1 } },
          'pull_request',
          'closed',
        ),
      ).toBe(true);
    });

    it('rejects unmerged PR close', () => {
      expect(
        isPullRequestMergedClose(
          { action: 'closed', pull_request: { merged: false, number: 1 } },
          'pull_request',
          'closed',
        ),
      ).toBe(false);
    });

    it('reads workflow_run conclusion', () => {
      expect(
        extractWorkflowRunConclusion(
          { workflow_run: { conclusion: 'success' } },
          'workflow_run',
        ),
      ).toBe('success');
    });
  });
});
