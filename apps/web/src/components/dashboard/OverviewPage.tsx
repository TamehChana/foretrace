import { Activity, Cpu, Layers } from 'lucide-react';
import type { ApiHealthState } from '../../hooks/use-api-health';
import type { OrganizationsState } from '../../hooks/use-organizations';
import { PageHeader } from '../ui/PageHeader';
import { ActivityEmptyState } from './ActivityEmptyState';
import { ApiHealthPanel } from './ApiHealthPanel';
import { MetricCard } from './MetricCard';
import { OrganizationsPanel } from './OrganizationsPanel';
import { RoadmapCard } from './RoadmapCard';

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}

export function OverviewPage({
  health,
  organizations,
}: {
  health: ApiHealthState;
  organizations: OrganizationsState;
}) {
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
            before they’re committed in a status meeting.
          </>
        }
        meta={
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Today
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {formatToday()}
            </p>
          </div>
        }
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Elevated task risk"
          value="—"
          subtitle="Tasks trending High or Critical with machine-readable reasons and recommended PM actions."
          icon={Layers}
          enterDelayMs={0}
        />
        <MetricCard
          title="Stale collaboration"
          value="—"
          subtitle="Commit cadence, PR age, and review stalls distilled for delivery managers."
          icon={Activity}
          enterDelayMs={70}
        />
        <MetricCard
          title="Technical friction"
          value="—"
          subtitle="Build / test / runtime bursts from the CLI, fingerprinted per task and engineer."
          icon={Cpu}
          enterDelayMs={140}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="animate-rise lg:col-span-7" style={{ animationDelay: '200ms' }}>
          <h2 className="sr-only">Signal activity</h2>
          <ActivityEmptyState />
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
