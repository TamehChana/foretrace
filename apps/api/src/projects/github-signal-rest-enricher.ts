import { Injectable, Logger } from '@nestjs/common';

import { decryptFromStorage, isSecretConfigured } from '../crypto/app-secret-crypto';

export type GithubRestEnrichment = {
  fetchedAt: string;
  openPullRequestsFromApi: number | null;
  openIssuesFromApi: number | null;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  combinedStatus: string | null;
  /** ISO timestamp of last push to the repo (GitHub `pushed_at`). */
  lastRepositoryPushAt: string | null;
  /** PRs merged in the last 7 calendar days (search API, repo-wide). */
  mergedPullRequestsLast7Days: number | null;
};

const GITHUB_API = 'https://api.github.com';

@Injectable()
export class GithubSignalRestEnricher {
  private readonly log = new Logger(GithubSignalRestEnricher.name);

  async enrich(
    repositoryFullName: string,
    githubPatCiphertext: string | null,
  ): Promise<GithubRestEnrichment | null> {
    if (!githubPatCiphertext) {
      return null;
    }
    const token = decryptFromStorage(githubPatCiphertext);
    if (!token) {
      this.log.warn(
        'GitHub PAT ciphertext present but decrypt failed (check FORETRACE_APP_SECRET)',
      );
      return null;
    }

    const parts = repositoryFullName.trim().toLowerCase().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    const [owner, repo] = parts;

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers,
      });
      if (!repoRes.ok) {
        this.log.warn(
          `GitHub REST repo fetch ${repoRes.status} for ${repositoryFullName}`,
        );
        return null;
      }
      const repoJson = (await repoRes.json()) as {
        default_branch?: string;
        open_issues_count?: number;
        pushed_at?: string;
      };
      const defaultBranch = repoJson.default_branch ?? null;
      const openIssuesFromRepo =
        typeof repoJson.open_issues_count === 'number'
          ? repoJson.open_issues_count
          : null;
      const lastRepositoryPushAt =
        typeof repoJson.pushed_at === 'string' ? repoJson.pushed_at : null;

      let openPullRequestsFromApi: number | null = null;
      const prSearchRes = await fetch(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `repo:${owner}/${repo} is:pr is:open`,
        )}&per_page=1`,
        { headers },
      );
      if (prSearchRes.ok) {
        const searchJson = (await prSearchRes.json()) as { total_count?: number };
        if (typeof searchJson.total_count === 'number') {
          openPullRequestsFromApi = searchJson.total_count;
        }
      }

      /** Open issues only (PRs excluded), for rollup parity with webhook-driven issue counts. */
      let openIssuesFromApi: number | null = null;
      const issueSearchRes = await fetch(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `repo:${owner}/${repo} is:issue is:open`,
        )}&per_page=1`,
        { headers },
      );
      if (issueSearchRes.ok) {
        const issueSearchJson = (await issueSearchRes.json()) as {
          total_count?: number;
        };
        if (typeof issueSearchJson.total_count === 'number') {
          openIssuesFromApi = issueSearchJson.total_count;
        }
      }
      if (openIssuesFromApi === null) {
        openIssuesFromApi = openIssuesFromRepo;
      }

      let mergedPullRequestsLast7Days: number | null = null;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const mergedSince = weekAgo.toISOString().slice(0, 10);
      const mergedSearchRes = await fetch(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `repo:${owner}/${repo} is:pr is:merged merged:>${mergedSince}`,
        )}&per_page=1`,
        { headers },
      );
      if (mergedSearchRes.ok) {
        const mergedJson = (await mergedSearchRes.json()) as {
          total_count?: number;
        };
        if (typeof mergedJson.total_count === 'number') {
          mergedPullRequestsLast7Days = mergedJson.total_count;
        }
      }

      let defaultBranchHeadSha: string | null = null;
      let combinedStatus: string | null = null;
      if (defaultBranch) {
        const branchRes = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(defaultBranch)}`,
          { headers },
        );
        if (branchRes.ok) {
          const br = (await branchRes.json()) as { sha?: string };
          if (typeof br.sha === 'string') {
            defaultBranchHeadSha = br.sha;
            const stRes = await fetch(
              `${GITHUB_API}/repos/${owner}/${repo}/commits/${br.sha}/status`,
              { headers },
            );
            if (stRes.ok) {
              const st = (await stRes.json()) as { state?: string };
              if (typeof st.state === 'string') {
                combinedStatus = st.state;
              }
            }
          }
        }
      }

      return {
        fetchedAt: new Date().toISOString(),
        openPullRequestsFromApi,
        openIssuesFromApi,
        defaultBranch,
        defaultBranchHeadSha,
        combinedStatus,
        lastRepositoryPushAt,
        mergedPullRequestsLast7Days,
      };
    } catch (e: unknown) {
      this.log.warn(
        `GitHub REST enrich failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Aggregate Checks API state for a pull request head (`/commits/{sha}/status`).
   * Always returns an object; inspect `detail` when `combinedStatus` is null.
   */
  async getPullRequestCombinedStatus(
    repositoryFullName: string,
    githubPatCiphertext: string | null,
    pullNumber: number,
  ): Promise<{
    combinedStatus: string | null;
    headSha: string | null;
    detail:
      | 'ok'
      | 'missing_pat'
      | 'decrypt_failed'
      | 'pull_request_not_found'
      | 'pull_request_forbidden'
      | 'status_unavailable';
  }> {
    if (!githubPatCiphertext || pullNumber < 1) {
      return {
        combinedStatus: null,
        headSha: null,
        detail: 'missing_pat',
      };
    }
    const token = decryptFromStorage(githubPatCiphertext);
    if (!token) {
      return {
        combinedStatus: null,
        headSha: null,
        detail: 'decrypt_failed',
      };
    }
    const parts = repositoryFullName.trim().toLowerCase().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        combinedStatus: null,
        headSha: null,
        detail: 'missing_pat',
      };
    }
    const [owner, repo] = parts;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    try {
      const prRes = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}`,
        { headers },
      );
      if (prRes.status === 404) {
        return {
          combinedStatus: null,
          headSha: null,
          detail: 'pull_request_not_found',
        };
      }
      if (!prRes.ok) {
        return {
          combinedStatus: null,
          headSha: null,
          detail:
            prRes.status === 401 || prRes.status === 403
              ? 'pull_request_forbidden'
              : 'pull_request_not_found',
        };
      }
      const prJson = (await prRes.json()) as { head?: { sha?: string } };
      const headSha =
        typeof prJson.head?.sha === 'string' ? prJson.head.sha : null;
      if (!headSha) {
        return {
          combinedStatus: null,
          headSha: null,
          detail: 'pull_request_not_found',
        };
      }
      const stRes = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/commits/${headSha}/status`,
        { headers },
      );
      if (!stRes.ok) {
        return {
          combinedStatus: null,
          headSha,
          detail: 'status_unavailable',
        };
      }
      const st = (await stRes.json()) as { state?: string };
      const combinedStatus =
        typeof st.state === 'string' ? st.state : null;
      return { combinedStatus, headSha, detail: 'ok' };
    } catch (e: unknown) {
      this.log.warn(
        `GitHub PR status fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        combinedStatus: null,
        headSha: null,
        detail: 'pull_request_not_found',
      };
    }
  }

  /**
   * Reads `GET /repos/{owner}/{repo}/issues/{n}` (GitHub exposes PRs here too).
   * Used to align Foretrace task progress when webhooks were missed.
   */
  async fetchRepoIssueOrPullView(
    repositoryFullName: string,
    githubPatCiphertext: string | null,
    issueNumber: number,
  ): Promise<
    | {
        ok: true;
        state: 'open' | 'closed';
        isPullRequest: boolean;
        merged: boolean;
      }
    | {
        ok: false;
        detail:
          | 'missing_pat'
          | 'app_secret_unconfigured'
          | 'decrypt_failed'
          | 'invalid_repo'
          | 'not_found'
          | 'forbidden'
          | 'bad_response';
      }
  > {
    const trimmedPat =
      typeof githubPatCiphertext === 'string'
        ? githubPatCiphertext.trim()
        : '';
    if (!trimmedPat || issueNumber < 1) {
      return { ok: false, detail: 'missing_pat' };
    }
    if (!isSecretConfigured()) {
      return { ok: false, detail: 'app_secret_unconfigured' };
    }
    const token = decryptFromStorage(trimmedPat);
    if (!token) {
      return { ok: false, detail: 'decrypt_failed' };
    }
    const parts = repositoryFullName.trim().toLowerCase().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { ok: false, detail: 'invalid_repo' };
    }
    const [owner, repo] = parts;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    try {
      const issueRes = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`,
        { headers },
      );
      if (issueRes.status === 404) {
        return { ok: false, detail: 'not_found' };
      }
      if (!issueRes.ok) {
        return {
          ok: false,
          detail:
            issueRes.status === 401 || issueRes.status === 403
              ? 'forbidden'
              : 'bad_response',
        };
      }
      const json = (await issueRes.json()) as {
        state?: unknown;
        pull_request?: { merged_at?: unknown } | null;
      };
      const s = json.state;
      if (s !== 'open' && s !== 'closed') {
        return { ok: false, detail: 'bad_response' };
      }
      const pr = json.pull_request;
      const isPullRequest =
        pr !== null && pr !== undefined && typeof pr === 'object';
      let merged = false;
      if (isPullRequest) {
        const m = (pr as { merged_at?: unknown }).merged_at;
        merged = typeof m === 'string' && m.length > 0;
      }
      return { ok: true, state: s, isPullRequest, merged };
    } catch (e: unknown) {
      this.log.warn(
        `GitHub issue view fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { ok: false, detail: 'bad_response' };
    }
  }
}
