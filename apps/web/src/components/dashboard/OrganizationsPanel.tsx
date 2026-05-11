import { useCallback } from 'react';
import { Building2, ClipboardCopy } from 'lucide-react';
import type { OrgListItem, OrganizationsState } from '../../hooks/use-organizations';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

function OrgIdCopyButton({ id }: { id: string }) {
  const showToast = useToast();
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(id);
      showToast('Organization ID copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [id, showToast]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
      title="Copy organization ID"
    >
      <ClipboardCopy size={12} strokeWidth={2} aria-hidden />
      Copy ID
    </button>
  );
}

function OrgRow({ org }: { org: OrgListItem }) {
  return (
    <li className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 dark:border-zinc-700/80 dark:bg-zinc-950/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{org.name}</p>
          <p
            className="mt-1 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
            title={org.id}
          >
            {org.id}
          </p>
        </div>
        <OrgIdCopyButton id={org.id} />
      </div>
    </li>
  );
}

export function OrganizationsPanel({ state }: { state: OrganizationsState }) {
  const { openAuthModal, openCreateOrganizationModal } = useAuthSession();

  return (
    <section
      className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/55"
      aria-labelledby="orgs-heading"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700/80">
          <Building2 size={22} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="orgs-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Organizations
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            Member boundaries, repos, quotas, and policy templates—each scoped to a workspace root.
          </p>

          <div className="mt-5">
            {state.status === 'loading' ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ) : state.status === 'signed_out' ? (
              <div>
                <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Sign in to list organizations where you have memberships.
                </p>
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="mt-3 rounded-xl border border-accent-300/70 bg-accent-500/10 px-4 py-2 text-xs font-semibold text-accent-900 shadow-sm transition-[box-shadow,transform] hover:bg-accent-500/15 hover:shadow dark:border-accent-600/35 dark:bg-accent-500/12 dark:text-accent-100 dark:hover:bg-accent-500/18"
                >
                  Sign in
                </button>
              </div>
            ) : state.status === 'error' ? (
              <p className="text-[13px] font-medium text-rose-600 dark:text-rose-400">{state.message}</p>
            ) : state.items.length === 0 ? (
              <div>
                <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  No workspaces yet — create your first organization to bootstrap delivery monitoring.
                </p>
                <button
                  type="button"
                  onClick={() => openCreateOrganizationModal()}
                  className="mt-3 rounded-xl border border-accent-300/70 bg-accent-500/10 px-4 py-2 text-xs font-semibold text-accent-900 shadow-sm transition-[box-shadow,transform] hover:bg-accent-500/15 hover:shadow dark:border-accent-600/35 dark:bg-accent-500/12 dark:text-accent-100 dark:hover:bg-accent-500/18"
                >
                  Create organization
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
                  <span className="text-[2rem] font-semibold tracking-tight leading-none">
                    {state.items.length}
                  </span>
                  <span className="ml-2 align-middle text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                    workspace{state.items.length === 1 ? '' : 's'}
                  </span>
                </p>
                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Each workspace has a unique ID (for CLI <span className="font-mono">FORETRACE_ORGANIZATION_ID</span> and support). Copy from the list below—
                  you do not need to read it from the address bar.
                </p>
                <ul className="space-y-2" role="list">
                  {state.items.map((org) => (
                    <OrgRow key={org.id} org={org} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
