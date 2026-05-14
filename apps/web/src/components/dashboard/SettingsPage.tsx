import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowLeft, Download, ScrollText, Settings2, ThumbsUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatApiErrorResponse } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useOrgMemberRole } from '../../hooks/use-org-member-role';
import { useOrganizations } from '../../hooks/use-organizations';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { OrganizationIdCopyRow } from '../ui/OrganizationIdCopyRow';
import { UserIdCopyRow } from '../ui/UserIdCopyRow';
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

type InsightFeedbackRow = {
  id: string;
  createdAt: string;
  kind: string;
  helpful: boolean;
  comment: string | null;
  project: { id: string; name: string };
  user: { id: string; email: string; displayName: string | null };
};

function insightKindLabel(kind: string): string {
  if (kind === 'RISK_SUMMARY') {
    return 'Trace Analyst — risk (persisted)';
  }
  if (kind === 'PROJECT_IMPACT_ANALYSIS') {
    return 'Trace Analyst read (on-demand)';
  }
  return kind;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildInsightFeedbackCsv(rows: InsightFeedbackRow[]): string {
  const header = ['createdAt', 'project', 'user', 'kind', 'helpful', 'comment'].join(',');
  const lines = rows.map((r) =>
    [
      escapeCsvCell(r.createdAt),
      escapeCsvCell(r.project.name),
      escapeCsvCell(r.user.displayName?.trim() || r.user.email),
      escapeCsvCell(r.kind),
      escapeCsvCell(String(r.helpful)),
      escapeCsvCell((r.comment ?? '').replace(/\r?\n/g, ' ')),
    ].join(','),
  );
  return [header, ...lines].join('\r\n');
}

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

  const [insightState, setInsightState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ok'; items: InsightFeedbackRow[] }
    | { status: 'error'; message: string }
    | { status: 'forbidden' }
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

  const memberRole = useOrgMemberRole(organizationId);
  const canViewInsightFeedback =
    memberRole.status === 'ok' &&
    (memberRole.role === 'PM' || memberRole.role === 'ADMIN');

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

  const loadInsightFeedback = useCallback(async () => {
    if (!organizationId || !canViewInsightFeedback) {
      setInsightState({ status: 'idle' });
      return;
    }
    setInsightState({ status: 'loading' });
    const res = await apiFetch(
      `/organizations/${organizationId}/insight-feedback?limit=100`,
    );
    const raw: unknown = await res.json().catch(() => null);
    if (res.status === 403) {
      setInsightState({ status: 'forbidden' });
      return;
    }
    if (!res.ok) {
      setInsightState({
        status: 'error',
        message: formatApiErrorResponse(raw, res.status),
      });
      return;
    }
    const body = raw as { data?: unknown };
    const arr = Array.isArray(body.data) ? body.data : [];
    const items: InsightFeedbackRow[] = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const o = row as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : null;
      const createdAt = typeof o.createdAt === 'string' ? o.createdAt : null;
      const kind = typeof o.kind === 'string' ? o.kind : null;
      const helpful = typeof o.helpful === 'boolean' ? o.helpful : null;
      const comment =
        typeof o.comment === 'string'
          ? o.comment
          : o.comment === null
            ? null
            : null;
      const project = o.project;
      const user = o.user;
      if (
        !id ||
        !createdAt ||
        !kind ||
        helpful === null ||
        !project ||
        typeof project !== 'object' ||
        !user ||
        typeof user !== 'object'
      ) {
        continue;
      }
      const p = project as Record<string, unknown>;
      const u = user as Record<string, unknown>;
      const projectName = typeof p.name === 'string' ? p.name : null;
      const projectId = typeof p.id === 'string' ? p.id : null;
      const email = typeof u.email === 'string' ? u.email : null;
      const userId = typeof u.id === 'string' ? u.id : null;
      if (!projectName || !projectId || !email || !userId) {
        continue;
      }
      items.push({
        id,
        createdAt,
        kind,
        helpful,
        comment,
        project: { id: projectId, name: projectName },
        user: {
          id: userId,
          email,
          displayName:
            typeof u.displayName === 'string'
              ? u.displayName
              : u.displayName === null
                ? null
                : null,
        },
      });
    }
    setInsightState({ status: 'ok', items });
  }, [organizationId, canViewInsightFeedback]);

  useEffect(() => {
    void loadInsightFeedback();
  }, [loadInsightFeedback]);

  const signedIn = snapshot.status === 'ready' && snapshot.user !== null;

  return (
    <main>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Audit log for this organization, plus Trace Analyst thumbs (PM/admin) for tuning narratives."
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
          <UserIdCopyRow
            userId={snapshot.status === 'ready' ? snapshot.user?.id : null}
            className="mx-auto mt-6 max-w-md text-left"
          />
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

          <UserIdCopyRow
            userId={snapshot.status === 'ready' ? snapshot.user?.id : null}
            className="max-w-md"
          />

          {memberRole.status === 'loading' ? (
            <Skeleton className="h-24 w-full max-w-3xl" />
          ) : canViewInsightFeedback ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-zinc-600 dark:text-zinc-400">
                <ThumbsUp size={18} aria-hidden />
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Trace Analyst feedback
                </h2>
              </div>
              <p className="max-w-3xl text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Thumbs from the Delivery risk panel (persisted risk summary and on-demand read). Export for offline
                review or model tuning.
              </p>
              {insightState.status === 'loading' || insightState.status === 'idle' ? (
                <Skeleton className="h-32 w-full max-w-3xl" />
              ) : insightState.status === 'error' ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{insightState.message}</p>
              ) : insightState.status === 'forbidden' ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">You do not have access to this list.</p>
              ) : insightState.status === 'ok' && insightState.items.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">No feedback recorded yet.</p>
              ) : insightState.status === 'ok' ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
                      {insightState.items.length} row{insightState.items.length === 1 ? '' : 's'} ·{' '}
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {insightState.items.filter((r: InsightFeedbackRow) => r.helpful).length} helpful
                      </span>
                      {' · '}
                      <span className="text-amber-800 dark:text-amber-400">
                        {insightState.items.filter((r: InsightFeedbackRow) => !r.helpful).length} not helpful
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = insightState.items;
                        const csv = buildInsightFeedbackCsv(rows);
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `trace-analyst-feedback-${organizationId ?? 'org'}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Download size={13} aria-hidden />
                      Download CSV
                    </button>
                  </div>
                  <ul className="max-w-3xl divide-y divide-zinc-100 overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50">
                    {insightState.items.map((row) => (
                      <li key={row.id} className="min-w-[560px] px-4 py-3 text-[12px]">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {insightKindLabel(row.kind)}
                          <span
                            className={
                              row.helpful
                                ? ' ml-2 text-emerald-700 dark:text-emerald-400'
                                : ' ml-2 text-amber-800 dark:text-amber-400'
                            }
                          >
                            {row.helpful ? 'Helpful' : 'Not helpful'}
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {formatWhen(row.createdAt)} · {row.project.name} ·{' '}
                          {row.user.displayName?.trim() || row.user.email}
                        </p>
                        {row.comment ? (
                          <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-zinc-600 dark:text-zinc-400">
                            {row.comment}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : memberRole.status === 'ok' ? (
            <p className="max-w-3xl text-[12px] text-zinc-500 dark:text-zinc-400">
              Trace Analyst feedback export is available to PMs and admins.
            </p>
          ) : memberRole.status === 'error' ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{memberRole.message}</p>
          ) : null}

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
