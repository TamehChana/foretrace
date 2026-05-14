import { useEffect, useState } from 'react';
import { apiFetch } from '../api-fetch';
import { useAuthSession } from '../providers/AuthSessionProvider';
import type { OrgProjectRow } from './use-org-projects';
import { parseOrgProjectsList } from './use-org-projects';

const MAX_PROJECTS_TO_FETCH = 20;

type SignalPayload = {
  tasks: {
    overdueCount: number;
    dueSoonLowProgressCount?: number;
  };
  github: {
    openPullRequests: number | null;
    openIssues: number | null;
  };
  terminal: {
    incidentsTouchedInWindow: number;
    batchesInWindow: number;
  };
};

type SnapshotEnvelope = { data?: { payload?: SignalPayload } | null };

export type OverviewProjectRollup = {
  id: string;
  name: string;
  incidents24h: number;
  batches24h: number;
  openPrs: number | null;
  openIssues: number | null;
  taskPressure: number;
};

export type OrganizationOverviewRollupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ok';
      organizationId: string;
      organizationName: string;
      /** Sorted by friction (incidents + batches), max 6 for UI */
      topProjects: OverviewProjectRollup[];
      totals: {
        taskPressure: number;
        openCollabItems: number;
        terminalIncidents24h: number;
        terminalBatches24h: number;
        projectsWithSnapshots: number;
        projectsConsidered: number;
        projectsInOrg: number;
      };
    }
  | { status: 'error'; message: string };

function activeProjectsSorted(projects: OrgProjectRow[]): OrgProjectRow[] {
  return projects
    .filter((p) => p.archivedAt === null)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

async function fetchSignalsSnapshot(
  organizationId: string,
  projectId: string,
): Promise<SignalPayload | null> {
  const res = await apiFetch(
    `/organizations/${organizationId}/projects/${projectId}/signals`,
  );
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return null;
  }
  const body = raw as SnapshotEnvelope;
  const snap = body.data;
  if (!snap || typeof snap !== 'object' || !('payload' in snap)) {
    return null;
  }
  const p = (snap as { payload: unknown }).payload;
  if (!p || typeof p !== 'object') {
    return null;
  }
  const o = p as Record<string, unknown>;
  const tasks = o.tasks;
  const github = o.github;
  const terminal = o.terminal;
  if (
    !tasks ||
    typeof tasks !== 'object' ||
    !github ||
    typeof github !== 'object' ||
    !terminal ||
    typeof terminal !== 'object'
  ) {
    return null;
  }
  const tt = tasks as Record<string, unknown>;
  const gh = github as Record<string, unknown>;
  const tm = terminal as Record<string, unknown>;
  const overdueCount =
    typeof tt.overdueCount === 'number' && Number.isFinite(tt.overdueCount)
      ? tt.overdueCount
      : 0;
  const dueSoonLow =
    typeof tt.dueSoonLowProgressCount === 'number' &&
    Number.isFinite(tt.dueSoonLowProgressCount)
      ? tt.dueSoonLowProgressCount
      : 0;
  const openPullRequests =
    typeof gh.openPullRequests === 'number' && Number.isFinite(gh.openPullRequests)
      ? gh.openPullRequests
      : gh.openPullRequests === null
        ? null
        : null;
  const openIssues =
    typeof gh.openIssues === 'number' && Number.isFinite(gh.openIssues)
      ? gh.openIssues
      : gh.openIssues === null
        ? null
        : null;
  const incidentsTouchedInWindow =
    typeof tm.incidentsTouchedInWindow === 'number' &&
    Number.isFinite(tm.incidentsTouchedInWindow)
      ? tm.incidentsTouchedInWindow
      : 0;
  const batchesInWindow =
    typeof tm.batchesInWindow === 'number' && Number.isFinite(tm.batchesInWindow)
      ? tm.batchesInWindow
      : 0;
  return {
    tasks: { overdueCount, dueSoonLowProgressCount: dueSoonLow },
    github: { openPullRequests, openIssues },
    terminal: { incidentsTouchedInWindow, batchesInWindow },
  };
}

/**
 * Aggregates persisted 24h signal snapshots across recent projects in one org
 * (for the Overview dashboard — no new API).
 */
export function useOrganizationOverviewRollup(
  organizationId: string | null,
  organizationName: string | null,
  refreshKey: number,
): OrganizationOverviewRollupState {
  const { snapshot, workspaceListBump } = useAuthSession();
  const signedIn = snapshot.status === 'ready' && snapshot.user !== null;
  const [state, setState] = useState<OrganizationOverviewRollupState>({
    status: 'idle',
  });

  useEffect(() => {
    if (!signedIn || !organizationId || !organizationName) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects`,
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const projects = parseOrgProjectsList(await res.json());
        const active = activeProjectsSorted(projects);
        const slice = active.slice(0, MAX_PROJECTS_TO_FETCH);
        const rows: OverviewProjectRollup[] = [];

        let taskPressure = 0;
        let openCollabItems = 0;
        let terminalIncidents24h = 0;
        let terminalBatches24h = 0;
        let projectsWithSnapshots = 0;

        await Promise.all(
          slice.map(async (p) => {
            const payload = await fetchSignalsSnapshot(organizationId, p.id);
            if (cancelled) {
              return;
            }
            if (!payload) {
              rows.push({
                id: p.id,
                name: p.name,
                incidents24h: 0,
                batches24h: 0,
                openPrs: null,
                openIssues: null,
                taskPressure: 0,
              });
              return;
            }
            projectsWithSnapshots += 1;
            const overdue = payload.tasks.overdueCount;
            const dueSoon = payload.tasks.dueSoonLowProgressCount ?? 0;
            const tp = overdue + dueSoon;
            const inc = payload.terminal.incidentsTouchedInWindow;
            const bat = payload.terminal.batchesInWindow;
            const prs = payload.github.openPullRequests;
            const iss = payload.github.openIssues;
            const prNum = prs ?? 0;
            const isNum = iss ?? 0;
            taskPressure += tp;
            openCollabItems += prNum + isNum;
            terminalIncidents24h += inc;
            terminalBatches24h += bat;
            rows.push({
              id: p.id,
              name: p.name,
              incidents24h: inc,
              batches24h: bat,
              openPrs: prs,
              openIssues: iss,
              taskPressure: tp,
            });
          }),
        );

        if (cancelled) {
          return;
        }

        const topProjects = rows
          .slice()
          .sort((a, b) => {
            const score = (p: OverviewProjectRollup) =>
              p.taskPressure +
              (p.openPrs ?? 0) +
              (p.openIssues ?? 0) +
              p.incidents24h +
              p.batches24h;
            return score(b) - score(a);
          })
          .slice(0, 6);

        setState({
          status: 'ok',
          organizationId,
          organizationName,
          topProjects,
          totals: {
            taskPressure,
            openCollabItems,
            terminalIncidents24h,
            terminalBatches24h,
            projectsWithSnapshots,
            projectsConsidered: slice.length,
            projectsInOrg: active.length,
          },
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Request failed',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    organizationId,
    organizationName,
    refreshKey,
    workspaceListBump,
  ]);

  return state;
}
