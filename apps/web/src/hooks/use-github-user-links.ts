import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type GithubUserLinkRow = {
  id: string;
  githubLogin: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
};

export type GithubUserLinksState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; links: GithubUserLinkRow[] }
  | { status: 'error'; message: string };

function parseList(json: unknown): GithubUserLinkRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new Error('Invalid row');
    }
    const r = row as Record<string, unknown>;
    const user = r.user;
    if (!user || typeof user !== 'object') {
      throw new Error('Invalid user embed');
    }
    const u = user as Record<string, unknown>;
    return {
      id: String(r.id),
      githubLogin: String(r.githubLogin),
      userId: String(r.userId),
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
      user: {
        id: String(u.id),
        email: String(u.email),
        displayName:
          typeof u.displayName === 'string'
            ? u.displayName
            : u.displayName === null
              ? null
              : null,
      },
    };
  });
}

export function useGithubUserLinks(
  organizationId: string | null,
  projectId: string | null,
  refreshKey: number,
  /** Only fetch when GitHub connection exists */
  enabled: boolean,
): GithubUserLinksState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<GithubUserLinksState>({ status: 'idle' });

  useEffect(() => {
    if (
      !organizationId ||
      !projectId ||
      !signedIn ||
      !enabled
    ) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/github/user-links`,
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const links = parseList(await res.json());
        return links;
      })
      .then((links) => {
        if (!cancelled) {
          setState({ status: 'ok', links });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Request failed',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId, signedIn, enabled, refreshKey]);

  return state;
}
