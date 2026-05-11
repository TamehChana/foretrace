import { Injectable, Logger } from '@nestjs/common';

import { decryptFromStorage } from '../crypto/app-secret-crypto';

export type GithubRestEnrichment = {
  fetchedAt: string;
  openPullRequestsFromApi: number | null;
  openIssuesFromApi: number | null;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  combinedStatus: string | null;
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
      };
      const defaultBranch = repoJson.default_branch ?? null;
      const openIssuesFromApi =
        typeof repoJson.open_issues_count === 'number'
          ? repoJson.open_issues_count
          : null;

      let openPullRequestsFromApi: number | null = null;
      const searchRes = await fetch(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `repo:${owner}/${repo} is:pr is:open`,
        )}&per_page=1`,
        { headers },
      );
      if (searchRes.ok) {
        const searchJson = (await searchRes.json()) as { total_count?: number };
        if (typeof searchJson.total_count === 'number') {
          openPullRequestsFromApi = searchJson.total_count;
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
      };
    } catch (e: unknown) {
      this.log.warn(
        `GitHub REST enrich failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
