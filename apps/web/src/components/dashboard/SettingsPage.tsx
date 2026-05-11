import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowLeft, ScrollText, Settings2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useOrganizations } from '../../hooks/use-organizations';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { OrganizationIdCopyRow } from '../ui/OrganizationIdCopyRow';
import { PageHeader } from '../ui/PageHeader';
import { Skeleton } from '../ui/Skeleton';

type AuditRow = {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
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

export function SettingsPage() {
  const organizations = useOrganizations();
  const { snapshot } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawOrgParam = searchParams.get('org');

  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; items: AuditRow[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

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
    const res = await apiFetch(
      `/organizations/${organizationId}/audit-logs?limit=100`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      setState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: AuditRow[] };
    setState({ status: 'ok', items: body.data ?? [] });
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const signedIn = snapshot.status === 'ready' && snapshot.user !== null;

  return (
    <main>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Organization audit trail (recent actions). Other preferences stay minimal until dedicated APIs land."
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
          Sign in to load workspace settings.
        </p>
      ) : organizations.status === 'loading' ? (
        <Skeleton className="mt-6 h-40 w-full max-w-3xl" />
      ) : organizations.status === 'error' ? (
        <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">
          {organizations.message}
        </p>
      ) : organizations.status === 'signed_out' ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Could not load your workspaces. Try signing in again.
        </p>
      ) : organizations.items.length === 0 ? (
        <div className="animate-rise mt-6 rounded-2xl border border-dashed border-zinc-300/90 bg-white/80 p-10 text-center shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/40">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-800 ring-1 ring-accent-400/25 dark:text-accent-200 dark:ring-accent-500/30">
            <Settings2 size={28} strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            No organization yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Create or join an organization to see audit entries scoped to that
            workspace.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {organizations.items.length > 1 ? (
            <label className="flex max-w-md flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Organization
              <select
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={organizationId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) {
                    setSearchParams({ org: v }, { replace: true });
                  }
                }}
              >
                {organizations.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <OrganizationIdCopyRow organizationId={organizationId} className="max-w-md" />

          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <ScrollText size={18} aria-hidden />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Audit log
            </h2>
          </div>

          {state.status === 'loading' || state.status === 'idle' ? (
            <Skeleton className="h-48 w-full max-w-3xl" />
          ) : state.status === 'error' ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {state.message}
            </p>
          ) : state.status === 'ok' && state.items.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No audit entries yet for this organization.
            </p>
          ) : state.status === 'ok' ? (
            <ul className="max-w-3xl divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50">
              {state.items.map((row) => (
                <li key={row.id} className="px-4 py-3 text-[13px]">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {row.action}
                    {row.resourceType ? (
                      <span className="font-normal text-zinc-500">
                        {' '}
                        · {row.resourceType}
                        {row.resourceId ? ` ${row.resourceId.slice(0, 8)}…` : ''}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {formatWhen(row.createdAt)}
                    {row.actor ? (
                      <>
                        {' '}
                        · {row.actor.displayName ?? row.actor.email}
                      </>
                    ) : (
                      ' · System'
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </main>
  );
}
