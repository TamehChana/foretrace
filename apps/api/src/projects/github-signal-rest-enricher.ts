import { Injectable, Logger } from '@nestjs/common';

import { decryptFromStorage } from '../crypto/app-secret-crypto';

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
}
