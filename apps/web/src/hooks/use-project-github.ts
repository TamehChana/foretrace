import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type GithubRecentEventRow = {
  id: string;
  eventType: string;
  action: string | null;
  actorLogin: string | null;
  createdAt: string;
};

export type GithubConnectionView = {
  id: string;
  repositoryFullName: string;
  lastEventAt: string | null;
  lastPushAt: string | null;
  openPullRequestCount: number;
  openIssueCount: number;
  recentEvents: GithubRecentEventRow[];
};

export type ProjectGithubState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; connected: false }
  | { status: 'ok'; connected: true; connection: GithubConnectionView }
  | { status: 'error'; message: string };

function parseSummary(json: unknown): ProjectGithubState {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    return { status: 'error', message: 'Invalid response shape' };
  }
  const raw = (json as { data: unknown }).data;
  if (raw === null) {
    return { status: 'ok', connected: false };
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('id' in raw && 'repositoryFullName' in raw)
  ) {
    return { status: 'error', message: 'Invalid connection payload' };
  }
  const c = raw as Record<string, unknown>;
  const eventsRaw = c.recentEvents;
  const recentEvents: GithubRecentEventRow[] = Array.isArray(eventsRaw)
    ? eventsRaw.map((e) => {
        const row = e as GithubRecentEventRow;
        return {
          id: String(row.id),
          eventType: String(row.eventType),
          action:
            typeof row.action === 'string'
              ? row.action
              : row.action === null
                ? null
                : null,
          actorLogin:
            typeof row.actorLogin === 'string'
              ? row.actorLogin
              : row.actorLogin === null
                ? null
                : null,
          createdAt: String(row.createdAt),
        };
      })
    : [];
  const connection: GithubConnectionView = {
    id: String(c.id),
    repositoryFullName: String(c.repositoryFullName),
    lastEventAt:
      typeof c.lastEventAt === 'string'
        ? c.lastEventAt
        : c.lastEventAt === null
          ? null
          : null,
    lastPushAt:
      typeof c.lastPushAt === 'string'
        ? c.lastPushAt
        : c.lastPushAt === null
          ? null
          : null,
    openPullRequestCount:
      typeof c.openPullRequestCount === 'number'
        ? c.openPullRequestCount
        : 0,
    openIssueCount:
      typeof c.openIssueCount === 'number' ? c.openIssueCount : 0,
    recentEvents,
  };
  return { status: 'ok', connected: true, connection };
}

export function useProjectGithub(
  organizationId: string | null,
  projectId: string | null,
  refreshKey: number,
): ProjectGithubState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<ProjectGithubState>({ status: 'idle' });

  useEffect(() => {
    if (!organizationId || !projectId || !signedIn) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/github`,
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const parsed = parseSummary(await res.json());
        return parsed;
      })
      .then((parsed) => {
        if (!cancelled) {
          setState(parsed);
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
  }, [organizationId, projectId, signedIn, refreshKey]);

  return state;
}
