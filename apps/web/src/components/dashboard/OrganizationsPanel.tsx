import { Building2 } from 'lucide-react';
import type { OrganizationsState } from '../../hooks/use-organizations';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { Skeleton } from '../ui/Skeleton';

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
            ) : state.count === 0 ? (
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
              <p className="text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
                <span className="text-[2rem] font-semibold tracking-tight leading-none">{state.count}</span>
                <span className="ml-2 align-middle text-[13px] font-normal text-zinc-500 dark:text-zinc-400">
                  workspace{state.count === 1 ? '' : 's'} indexed
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
