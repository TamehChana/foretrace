import { useCallback, useEffect, useRef, useState } from 'react';
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
  githubRepositoryFullName: string | null;
};

export type OrgProjectsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; projects: OrgProjectRow[] }
  | { status: 'error'; message: string };

/** Map `POST …/projects` JSON body to a list row (API omits `taskCount` on create). */
export function parseCreateProjectEnvelope(json: unknown): OrgProjectRow | null {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    return null;
  }
  const data = (json as { data: unknown }).data;
  if (!data || typeof data !== 'object' || !('id' in data && 'name' in data)) {
    return null;
  }
  const r = data as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  const name = typeof r.name === 'string' ? r.name : null;
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
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
    createdAt:
      typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt:
      typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
    taskCount: 0,
    githubRepositoryFullName: null,
  };
}

function parseList(json: unknown): OrgProjectRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map((row) => {
    if (!row || typeof row !== 'object' || !('id' in row && 'name' in row)) {
      throw new Error('Invalid project row');
    }
    const r = row as OrgProjectRow & {
      taskCount?: unknown;
      githubRepositoryFullName?: unknown;
    };
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
      githubRepositoryFullName:
        typeof r.githubRepositoryFullName === 'string'
          ? r.githubRepositoryFullName
          : r.githubRepositoryFullName === null
            ? null
            : null,
    };
  });
}

function mergeServerWithPending(
  server: OrgProjectRow[],
  pending: OrgProjectRow[],
): OrgProjectRow[] {
  const serverIds = new Set(server.map((p) => p.id));
  const extra = pending.filter((p) => !serverIds.has(p.id));
  return [...extra, ...server];
}

export function useOrgProjects(
  organizationId: string | null,
  refreshKey: number = 0,
): {
  projectsState: OrgProjectsState;
  ingestCreatedProject: (row: OrgProjectRow) => void;
} {
  const { snapshot } = useAuthSession();
  const signedIn =
    snapshot.status === 'ready' && snapshot.user !== null;

  const [state, setState] = useState<OrgProjectsState>({ status: 'idle' });
  const prevOrgRef = useRef<string | null>(null);

  const ingestCreatedProject = useCallback((row: OrgProjectRow) => {
    setState((prev) => {
      if (prev.status !== 'ok') {
        return { status: 'ok', projects: [row] };
      }
      if (prev.projects.some((p) => p.id === row.id)) {
        return prev;
      }
      return { status: 'ok', projects: [row, ...prev.projects] };
    });
  }, []);

  useEffect(() => {
    if (!organizationId || !signedIn) {
      setState({ status: 'idle' });
      prevOrgRef.current = null;
      return;
    }

    const orgChanged = prevOrgRef.current !== organizationId;
    prevOrgRef.current = organizationId;

    let cancelled = false;

    if (orgChanged) {
      setState({ status: 'loading' });
    } else {
      setState((prev) =>
        prev.status === 'ok' ? prev : { status: 'loading' },
      );
    }

    apiFetch(`/organizations/${organizationId}/projects`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return parseList(await res.json());
      })
      .then((projects) => {
        if (!cancelled) {
          setState((prev) => {
            const pending =
              prev.status === 'ok'
                ? prev.projects.filter(
                    (p) => !projects.some((s) => s.id === p.id),
                  )
                : [];
            return {
              status: 'ok',
              projects: mergeServerWithPending(projects, pending),
            };
          });
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

  return { projectsState: state, ingestCreatedProject };
}
