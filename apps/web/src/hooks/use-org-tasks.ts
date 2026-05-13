import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrgTaskGithubLinkedUser = {
  id: string;
  displayName: string | null;
  email: string;
};

export type OrgTaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  progress: number;
  assigneeId: string | null;
  createdById: string;
  githubIssueNumber: number | null;
  lastGithubActivityAt: string | null;
  lastGithubActorLogin: string | null;
  lastGithubLinkedUserId: string | null;
  lastGithubLinkedUser: OrgTaskGithubLinkedUser | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgTasksState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; tasks: OrgTaskRow[] }
  | { status: 'error'; message: string };

function parseGithubLinkedUser(
  raw: unknown,
): OrgTaskGithubLinkedUser | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'object' || !('id' in raw)) {
    return null;
  }
  const u = raw as Record<string, unknown>;
  return {
    id: String(u.id),
    displayName:
      typeof u.displayName === 'string'
        ? u.displayName
        : u.displayName === null
          ? null
          : null,
    email: typeof u.email === 'string' ? u.email : '',
  };
}

function parseList(json: unknown): OrgTaskRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map((row) => {
    if (!row || typeof row !== 'object' || !('id' in row && 'title' in row)) {
      throw new Error('Invalid task row');
    }
    const t = row as OrgTaskRow & {
      githubIssueNumber?: unknown;
      lastGithubActivityAt?: unknown;
      lastGithubActorLogin?: unknown;
      lastGithubLinkedUserId?: unknown;
      lastGithubLinkedUser?: unknown;
    };
    return {
      id: t.id,
      title: String(t.title),
      description:
        typeof t.description === 'string'
          ? t.description
          : t.description === null
            ? null
            : null,
      priority: String(t.priority),
      status: String(t.status),
      deadline:
        typeof t.deadline === 'string'
          ? t.deadline
          : t.deadline === null
            ? null
            : null,
      progress: typeof t.progress === 'number' ? t.progress : 0,
      assigneeId:
        typeof t.assigneeId === 'string'
          ? t.assigneeId
          : t.assigneeId === null
            ? null
            : null,
      createdById: String(t.createdById),
      githubIssueNumber:
        typeof t.githubIssueNumber === 'number' ? t.githubIssueNumber : null,
      lastGithubActivityAt:
        typeof t.lastGithubActivityAt === 'string'
          ? t.lastGithubActivityAt
          : t.lastGithubActivityAt === null
            ? null
            : null,
      lastGithubActorLogin:
        typeof t.lastGithubActorLogin === 'string'
          ? t.lastGithubActorLogin
          : t.lastGithubActorLogin === null
            ? null
            : null,
      lastGithubLinkedUserId:
        typeof t.lastGithubLinkedUserId === 'string'
          ? t.lastGithubLinkedUserId
          : t.lastGithubLinkedUserId === null
            ? null
            : null,
      lastGithubLinkedUser: parseGithubLinkedUser(t.lastGithubLinkedUser),
      createdAt: String(t.createdAt),
      updatedAt: String(t.updatedAt),
    };
  });
}

export function useOrgTasks(
  organizationId: string | null,
  projectId: string | null,
  refreshKey: number = 0,
): OrgTasksState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<OrgTasksState>({ status: 'idle' });

  useEffect(() => {
    if (!organizationId || !projectId || !signedIn) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/tasks`,
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return parseList(await res.json());
      })
      .then((tasks) => {
        if (!cancelled) {
          setState({ status: 'ok', tasks });
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
