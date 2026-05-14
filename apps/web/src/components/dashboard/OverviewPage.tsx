import { Activity, BookOpen, Cpu, Layers } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ApiHealthState } from '../../hooks/use-api-health';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { useOrganizationOverviewRollup } from '../../hooks/use-organization-overview-rollup';
import type { OrganizationsState } from '../../hooks/use-organizations';
import { PageHeader } from '../ui/PageHeader';
import { ApiHealthPanel } from './ApiHealthPanel';
import { MetricCard } from './MetricCard';
import { OrganizationsPanel } from './OrganizationsPanel';
import { OverviewActivityPanel } from './OverviewActivityPanel';
import { RoadmapCard } from './RoadmapCard';

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

export function OverviewPage({
  health,
  organizations,
}: {
  health: ApiHealthState;
  organizations: OrganizationsState;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawOrgParam = searchParams.get('org');
  const { workspaceListBump } = useAuthSession();

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

  const organizationName = useMemo(() => {
    if (organizations.status !== 'ok' || !organizationId) {
      return null;
    }
    return organizations.items.find((o) => o.id === organizationId)?.name ?? null;
  }, [organizations, organizationId]);

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

  const rollup = useOrganizationOverviewRollup(
    organizationId,
    organizationName,
    workspaceListBump,
  );

  const metricsLoading =
    organizations.status === 'loading' ||
    (organizations.status === 'ok' &&
      organizationId !== null &&
      (rollup.status === 'loading' || rollup.status === 'idle'));

  const showLiveMetrics =
    organizations.status === 'ok' &&
    organizationId !== null &&
    organizationName !== null &&
    rollup.status === 'ok';

  const metricPlaceholder: string = (() => {
    if (organizations.status === 'loading') {
      return '…';
    }
    if (
      organizations.status === 'signed_out' ||
      organizations.status === 'error' ||
      rollup.status === 'error'
    ) {
      return '—';
    }
    if (organizationId === null) {
      return '—';
    }
    if (rollup.status === 'loading' || rollup.status === 'idle') {
      return '…';
    }
    return '—';
  })();

  const taskValue = showLiveMetrics
    ? formatCount(rollup.totals.taskPressure)
    : metricPlaceholder;
  const collabValue = showLiveMetrics
    ? formatCount(rollup.totals.openCollabItems)
    : metricPlaceholder;
  const frictionValue = showLiveMetrics
    ? formatCount(
        rollup.totals.terminalIncidents24h + rollup.totals.terminalBatches24h,
      )
    : metricPlaceholder;

  const rollupFoot =
    showLiveMetrics && rollup.totals.projectsConsidered < rollup.totals.projectsInOrg
      ? ` (${rollup.totals.projectsConsidered} of ${rollup.totals.projectsInOrg} projects in snapshot rollups)`
      : '';

  return (
    <main>
      <PageHeader
        eyebrow="Delivery intelligence"
        title="Signal noise into explainable delivery risk"
        description={
          <>
            Foretrace fuses work planning, GitHub collaboration, and local developer friction into
            a single risk surface—so PMs see{' '}
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">why</span> dates slip
            before they're committed in a status meeting.
          </>
        }
        meta={
          <div className="flex flex-col items-end gap-3 text-right">
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition-[box-shadow,transform] hover:border-accent-300/60 hover:shadow-md active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-accent-600/40"
            >
              <BookOpen size={14} strokeWidth={2.5} aria-hidden />
              Full setup guide
            </Link>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Today
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {formatToday()}
              </p>
            </div>
          </div>
        }
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Task pressure"
          value={taskValue}
          valueLoading={metricsLoading && metricPlaceholder === '…'}
          subtitle={`Overdue tasks plus due-soon / low-progress rows from the latest 24h snapshot per project${rollupFoot}.`}
          icon={Layers}
          enterDelayMs={0}
        />
        <MetricCard
          title="Open collaboration"
          value={collabValue}
          valueLoading={metricsLoading && metricPlaceholder === '…'}
          subtitle={`Open pull requests and issues (from the REST slice on each snapshot) summed across projects${rollupFoot}.`}
          icon={Activity}
          enterDelayMs={70}
        />
        <MetricCard
          title="Terminal touches"
          value={frictionValue}
          valueLoading={metricsLoading && metricPlaceholder === '…'}
          subtitle={`Terminal incidents plus ingest batches recorded in the 24h rollup window${rollupFoot}.`}
          icon={Cpu}
          enterDelayMs={140}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="animate-rise lg:col-span-7" style={{ animationDelay: '200ms' }}>
          <h2 className="sr-only">Workspace activity</h2>
          <OverviewActivityPanel organizations={organizations} rollup={rollup} />
        </div>
        <div className="flex animate-rise flex-col gap-6 lg:col-span-5" style={{ animationDelay: '260ms' }}>
          <ApiHealthPanel state={health} />
          <OrganizationsPanel state={organizations} />
          <RoadmapCard />
        </div>
      </div>
    </main>
  );
}
