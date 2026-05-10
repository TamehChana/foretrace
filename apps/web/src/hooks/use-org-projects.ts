import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type OrgProjectRow = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
};

export type OrgProjectsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; projects: OrgProjectRow[] }
  | { status: 'error'; message: string };

function parseList(json: unknown): OrgProjectRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('id' in row && 'name' in row && 'taskCount' in row)
    ) {
      throw new Error('Invalid project row');
    }
    const r = row as OrgProjectRow;
    return {
      id: r.id,
      name: String(r.name),
      description:
        typeof r.description === 'string'
          ? r.description
          : r.description === null
            ? null
            : null,
      archivedAt:
        typeof r.archivedAt === 'string'
          ? r.archivedAt
          : r.archivedAt === null
            ? null
            : null,
      createdAt: String(r.createdAt),
      updatedAt: String(r.updatedAt),
      taskCount: typeof r.taskCount === 'number' ? r.taskCount : 0,
    };
  });
}

export function useOrgProjects(
  organizationId: string | null,
  refreshKey: number = 0,
): OrgProjectsState {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<OrgProjectsState>({ status: 'idle' });

  useEffect(() => {
    if (!organizationId || !signedIn) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    apiFetch(`/organizations/${organizationId}/projects`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return parseList(await res.json());
      })
      .then((projects) => {
        if (!cancelled) {
          setState({ status: 'ok', projects });
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
  }, [organizationId, signedIn, refreshKey]);

  return state;
}
