import { ArrowRight, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OrganizationsState } from '../../hooks/use-organizations';
import type { OrganizationOverviewRollupState } from '../../hooks/use-organization-overview-rollup';
import { Skeleton } from '../ui/Skeleton';
import { ActivityEmptyState } from './ActivityEmptyState';

function formatMetric(n: number): string {
  return n.toLocaleString();
}

export function OverviewActivityPanel(props: {
  organizations: OrganizationsState;
  rollup: OrganizationOverviewRollupState;
}) {
  const { organizations, rollup } = props;

  if (organizations.status === 'signed_out') {
    return <ActivityEmptyState />;
  }

  if (organizations.status === 'loading') {
    return (
      <section className="rounded-2xl border border-zinc-200/85 bg-white/95 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-24 w-full" />
      </section>
    );
  }

  if (organizations.status === 'error') {
    return (
      <section className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        {organizations.message}
      </section>
    );
  }

  if (organizations.items.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200/85 bg-white/95 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <Waves className="text-accent-600 dark:text-accent-400" size={28} strokeWidth={1.6} aria-hidden />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">No workspace yet</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Create an organization from Settings, then open Projects to add workstreams — rollups will show here.
        </p>
        <Link
          to="/settings"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Open settings
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
    );
  }

  if (rollup.status === 'loading' || rollup.status === 'idle') {
    return (
      <section
        className="rounded-2xl border border-zinc-200/85 bg-white/95 p-6 dark:border-zinc-800 dark:bg-zinc-900/50"
        aria-busy
        aria-label="Loading workspace activity"
      >
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-3 h-16 w-full" />
        <Skeleton className="mt-3 h-16 w-full" />
      </section>
    );
  }

  if (rollup.status === 'error') {
    return (
      <section className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        Could not load activity rollups: {rollup.message}
      </section>
    );
  }

  const { organizationId, organizationName, topProjects, totals } = rollup;
  const projectsLink = `/projects?org=${encodeURIComponent(organizationId)}`;
  const activeTop = topProjects.filter(
    (p) =>
      p.taskPressure > 0 ||
      p.incidents24h > 0 ||
      p.batches24h > 0 ||
      (p.openPrs ?? 0) > 0 ||
      (p.openIssues ?? 0) > 0,
  );

  if (totals.projectsInOrg === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200/85 bg-white/95 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No projects in {organizationName}</h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Add a project to start collecting GitHub, terminal, and task signals.
        </p>
        <Link
          to={projectsLink}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-semibold text-accent-950 hover:bg-accent-100 dark:border-accent-800 dark:bg-accent-950/40 dark:text-accent-100 dark:hover:bg-accent-900/50"
        >
          Go to projects
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
    );
  }

  const quiet =
    totals.taskPressure === 0 &&
    totals.openCollabItems === 0 &&
    totals.terminalIncidents24h === 0 &&
    totals.terminalBatches24h === 0;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-zinc-200/85 bg-white/95 shadow-md shadow-zinc-900/[0.04] dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-black/35"
      aria-labelledby="overview-activity-heading"
    >
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/80">
        <h2 id="overview-activity-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Workspace activity
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {organizationName}
          {totals.projectsConsidered < totals.projectsInOrg
            ? ` · totals from the ${totals.projectsConsidered} most recently updated projects`
            : ` · ${totals.projectsInOrg} active project${totals.projectsInOrg === 1 ? '' : 's'}`}
          . Figures come from the latest stored 24h signal snapshot per project (same as the Signals panel).
        </p>
      </div>

      {quiet ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Snapshots are quiet right now — connect GitHub, ingest terminal batches, or add tasks, then open a project
            and use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Refresh</strong> on Signals if you
            are a PM or admin.
          </p>
        </div>
      ) : activeTop.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Totals include activity outside the top preview list. Open{' '}
          <Link to={projectsLink} className="font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-400">
            Projects
          </Link>{' '}
          to inspect each workstream.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {activeTop.map((p) => {
            const friction = p.incidents24h + p.batches24h;
            const collab =
              (p.openPrs ?? 0) + (p.openIssues ?? 0);
            return (
              <li key={p.id}>
                <Link
                  to={projectsLink}
                  className="flex flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {p.taskPressure > 0 ? (
                      <span>
                        Task pressure <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{formatMetric(p.taskPressure)}</span>
                      </span>
                    ) : null}
                    {collab > 0 ? (
                      <span>
                        Open PRs/issues <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{formatMetric(collab)}</span>
                      </span>
                    ) : null}
                    {friction > 0 ? (
                      <span>
                        Terminal <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{formatMetric(friction)}</span> touches
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800/80">
        <Link
          to={projectsLink}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300"
        >
          View all projects
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
