import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

type GithubRestSlice = {
  fetchedAt: string;
  openPullRequestsFromApi: number | null;
  openIssuesFromApi: number | null;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  combinedStatus: string | null;
};

type SignalPayload = {
  windowHours: number;
  github: {
    webhookEventsInWindow: number;
    openPullRequests: number | null;
    openIssues: number | null;
    lastEventAt: string | null;
    rest?: GithubRestSlice | null;
  };
  terminal: {
    incidentsTouchedInWindow: number;
    newFingerprintsInWindow: number;
    batchesInWindow: number;
  };
  tasks: {
    activeCount: number;
    overdueCount: number;
    dueWithin7DaysCount: number;
  };
};

type SnapshotRow = {
  id: string;
  organizationId: string;
  projectId: string;
  windowHours: number;
  payload: SignalPayload;
  computedAt: string;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ProjectSignalsPanel(props: {
  organizationId: string;
  projectId: string;
  canManage: boolean;
  refreshKey: number;
}) {
  const { organizationId, projectId, canManage, refreshKey } = props;
  const showToast = useToast();
  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; snapshot: SnapshotRow | null }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/signals`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: SnapshotRow | null };
    setState({ status: 'ok', snapshot: body.data ?? null });
  }, [organizationId, projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const refresh = useCallback(async () => {
    const res = await apiFetch(
      `/organizations/${organizationId}/projects/${projectId}/signals/refresh`,
      { method: 'POST' },
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(formatApiErrorResponse(raw, res.status), 'error');
      return;
    }
    showToast('Signals refreshed', 'success');
    await load();
  }, [organizationId, projectId, load, showToast]);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Activity size={14} strokeWidth={2} aria-hidden />
            Signals (24h rollup)
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            First slice of SRS §7 — GitHub deliveries, terminal batches/incidents,
            and task pressure. The API also recomputes after webhooks and CLI ingest
            (at most about once per minute per project). PM/admin can force refresh.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            title="Recompute snapshot"
            onClick={() => {
              void refresh();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={12} strokeWidth={2} aria-hidden />
            Refresh
          </button>
        ) : null}
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : state.status === 'error' ? (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {state.message}
        </p>
      ) : state.snapshot === null ? (
        <p className="mt-3 text-[13px] text-zinc-500">
          No snapshot yet.
          {canManage
            ? ' Click Refresh to compute the first rollup.'
            : ' Ask a PM or admin to refresh signals.'}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-3">
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">GitHub events (24h)</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.github.webhookEventsInWindow}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Open PRs / issues</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.github.openPullRequests ?? '—'} /{' '}
              {state.snapshot.payload.github.openIssues ?? '—'}
            </dd>
          </div>
          {state.snapshot.payload.github.rest ? (
            <div className="col-span-2 rounded-lg border border-zinc-200/80 bg-white px-2 py-2 sm:col-span-3 dark:border-zinc-700 dark:bg-zinc-950/40">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                GitHub REST (optional PAT)
              </dt>
              <dd className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-700 dark:text-zinc-300 sm:grid-cols-4">
                <span>
                  PRs (API):{' '}
                  <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                    {state.snapshot.payload.github.rest.openPullRequestsFromApi ??
                      '—'}
                  </strong>
                </span>
                <span>
                  Issues (API):{' '}
                  <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                    {state.snapshot.payload.github.rest.openIssuesFromApi ?? '—'}
                  </strong>
                </span>
                <span className="truncate sm:col-span-2">
                  Default branch:{' '}
                  <code className="text-[10px]">
                    {state.snapshot.payload.github.rest.defaultBranch ?? '—'}
                  </code>
                </span>
                <span>
                  Combined status:{' '}
                  <strong>
                    {state.snapshot.payload.github.rest.combinedStatus ?? '—'}
                  </strong>
                </span>
                <span className="text-zinc-500 sm:col-span-3">
                  Fetched {formatWhen(state.snapshot.payload.github.rest.fetchedAt)}
                </span>
              </dd>
            </div>
          ) : null}
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Terminal batches (24h)</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.terminal.batchesInWindow}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Incidents touched (24h)</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.terminal.incidentsTouchedInWindow}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">New fingerprints (24h)</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.terminal.newFingerprintsInWindow}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Tasks overdue</dt>
            <dd className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">
              {state.snapshot.payload.tasks.overdueCount}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Due in 7d (active)</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.tasks.dueWithin7DaysCount}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Active tasks</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {state.snapshot.payload.tasks.activeCount}
            </dd>
          </div>
          <div className="col-span-2 rounded-lg bg-zinc-50 px-2 py-1.5 sm:col-span-3 dark:bg-zinc-900/80">
            <dt className="text-zinc-500">Computed</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {formatWhen(state.snapshot.computedAt)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
