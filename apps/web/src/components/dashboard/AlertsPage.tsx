import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowLeft, Bell, CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useOrganizations } from '../../hooks/use-organizations';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { useToast } from '../../providers/ToastProvider';
import { PageHeader } from '../ui/PageHeader';
import { Skeleton } from '../ui/Skeleton';

type AlertRow = {
  id: string;
  projectId: string;
  kind: string;
  summary: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
  project: { name: string };
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

export function AlertsPage() {
  const organizations = useOrganizations();
  const { snapshot } = useAuthSession();
  const showToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawOrgParam = searchParams.get('org');

  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; items: AlertRow[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markBusy, setMarkBusy] = useState<string | null>(null);

  const organizationId = useMemo(() => {
    if (organizations.status !== 'ok') {
      return null;
    }
    const ids = organizations.items.map((o) => o.id);
    if (ids.length === 0) {
      return null;
    }
    if (rawOrgParam && ids.includes(rawOrgParam)) {
      return rawOrgParam;
    }
    return ids[0] ?? null;
  }, [organizations, rawOrgParam]);

  useEffect(() => {
    if (organizations.status !== 'ok') {
      return;
    }
    const ids = organizations.items.map((o) => o.id);
    if (ids.length === 0) {
      if (rawOrgParam) {
        setSearchParams({}, { replace: true });
      }
      return;
    }
    const valid =
      rawOrgParam && ids.includes(rawOrgParam) ? rawOrgParam : ids[0];
    if (!rawOrgParam || rawOrgParam !== valid) {
      setSearchParams({ org: valid }, { replace: true });
    }
  }, [organizations, rawOrgParam, setSearchParams]);

  const load = useCallback(async () => {
    if (!organizationId) {
      setState({ status: 'ok', items: [] });
      return;
    }
    setState({ status: 'loading' });
    const q = unreadOnly ? '?unread=1&limit=100' : '?limit=100';
    const res = await apiFetch(
      `/organizations/${organizationId}/alerts${q}`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: AlertRow[] };
    setState({ status: 'ok', items: body.data ?? [] });
  }, [organizationId, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    if (!organizationId) {
      return;
    }
    setMarkBusy(id);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/alerts/${id}/read`,
        { method: 'POST' },
      );
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(formatApiErrorResponse(raw, res.status), 'error');
        return;
      }
      await load();
    } finally {
      setMarkBusy(null);
    }
  };

  const signedIn = snapshot.status === 'ready' && snapshot.user !== null;

  return (
    <main>
      <PageHeader
        eyebrow="Delivery signals"
        title="Alerts"
        description="Risk-driven notifications for your workspace. New items appear when a PM or admin runs Evaluate on a project and risk is at least Medium and has worsened or is first seen at that level."
        meta={
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition-[box-shadow,transform] hover:border-zinc-300 hover:shadow-md active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
          >
            <ArrowLeft size={14} strokeWidth={2.5} aria-hidden />
            Back to overview
          </Link>
        }
      />

      {!signedIn ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to see organization alerts.
        </p>
      ) : organizations.status === 'loading' ||
        organizations.status === 'idle' ? (
        <Skeleton className="mt-6 h-40 w-full max-w-2xl" />
      ) : organizations.status === 'error' ? (
        <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">
          {organizations.message}
        </p>
      ) : organizations.items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Join or create an organization first; alerts are scoped per workspace.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => {
                  setUnreadOnly(e.target.checked);
                }}
                className="rounded border-zinc-300 text-accent-600 focus:ring-accent-500 dark:border-zinc-600"
              />
              Unread only
            </label>
          </div>

          {state.status === 'loading' || state.status === 'idle' ? (
            <Skeleton className="h-48 w-full max-w-2xl" />
          ) : state.status === 'error' ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {state.message}
            </p>
          ) : state.items.length === 0 ? (
            <div className="animate-rise rounded-2xl border border-dashed border-zinc-300/90 bg-white/80 p-10 text-center shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/40">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-800 ring-1 ring-accent-400/25 dark:text-accent-200 dark:ring-accent-500/30">
                <Bell size={28} strokeWidth={1.75} aria-hidden />
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {unreadOnly ? 'No unread alerts' : 'Inbox is quiet'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Run Evaluate on a project from the Projects page when risk is
                elevated; matching events create rows here.
              </p>
            </div>
          ) : (
            <ul className="max-w-3xl divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50">
              {state.items.map((row) => (
                <li
                  key={row.id}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${
                    row.readAt ? 'opacity-70' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {row.summary}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {row.project.name} · {formatWhen(row.createdAt)}
                      {row.readAt ? ` · Read ${formatWhen(row.readAt)}` : ''}
                    </p>
                    <Link
                      to={`/projects?org=${encodeURIComponent(organizationId!)}`}
                      className="mt-2 inline-block text-[11px] font-semibold text-accent-700 hover:underline dark:text-accent-400"
                    >
                      Open projects
                    </Link>
                  </div>
                  {!row.readAt ? (
                    <button
                      type="button"
                      disabled={markBusy === row.id}
                      onClick={() => {
                        void markRead(row.id);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
                      Mark read
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
