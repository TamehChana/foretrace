import {
  collectIssueReferencesFromGithubWebhook,
  extractPullRequestNumber,
  summarizeGithubWebhookTouch,
} from './github-webhook-issue-refs';

describe('github-webhook-issue-refs', () => {
  describe('extractPullRequestNumber', () => {
    it('returns null for non pull_request events', () => {
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

    it('returns null for non-numeric number', () => {
      expect(
        extractPullRequestNumber(
          { pull_request: { number: '7' } },
          'pull_request',
        ),
      ).toBeNull();
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
    it('collects hashes from push commit messages', () => {
      const nums = collectIssueReferencesFromGithubWebhook(
        {
          commits: [{ message: 'Fix crash (#44) and see #45' }],
        },
        'push',
      );
      expect(nums.sort((a, b) => a - b)).toEqual([44, 45]);
    });
  });
});
