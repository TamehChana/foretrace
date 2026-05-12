import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { GithubSignalRestEnricher } from './github-signal-rest-enricher';

export type GithubRestEnrichment = {
  fetchedAt: string;
  openPullRequestsFromApi: number | null;
  openIssuesFromApi: number | null;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  combinedStatus: string | null;
};

export type ProjectSignalTaskTerminalFriction = {
  taskId: string;
  title: string;
  assigneeId: string | null;
  assigneeEmail: string | null;
  assigneeDisplayName: string | null;
  incidentTouchesInWindow: number;
  batchesPostedInWindow: number;
  lastIncidentAt: string | null;
  lastBatchAt: string | null;
};

export type ProjectSignalPayload = {
  windowHours: number;
  github: {
    webhookEventsInWindow: number;
    openPullRequests: number | null;
    openIssues: number | null;
    lastEventAt: string | null;
    rest: GithubRestEnrichment | null;
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
  /** Present on snapshots after this feature ships; ties terminal batches/incidents to tasks + assignees. */
  tasksWithTerminalFriction?: ProjectSignalTaskTerminalFriction[];
};

/** Minimum gap between automatic snapshot recomputes for the same project (webhooks + ingest). */
const AUTO_REFRESH_COOLDOWN_MS = 60_000;

@Injectable()
export class ProjectSignalsService {
  private readonly log = new Logger(ProjectSignalsService.name);
  private readonly lastAutoRefreshAtMs = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly githubRest: GithubSignalRestEnricher,
  ) {}

  /**
   * Recomputes the persisted signal snapshot unless this project was refreshed recently.
   * Runs asynchronously; failures are logged and do not propagate.
   */
  scheduleRefreshSnapshot(projectId: string, organizationId: string): void {
    const now = Date.now();
    const last = this.lastAutoRefreshAtMs.get(projectId) ?? 0;
    if (now - last < AUTO_REFRESH_COOLDOWN_MS) {
      return;
    }
    this.lastAutoRefreshAtMs.set(projectId, now);
    void this.refreshSnapshot(projectId, organizationId).catch((err: unknown) => {
      this.log.warn(
        `Background project signal refresh failed for project ${projectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async getSnapshot(projectId: string, organizationId: string) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    return this.prisma.projectSignalSnapshot.findUnique({
      where: { projectId },
    });
  }

  async refreshSnapshot(
    projectId: string,
    organizationId: string,
    windowHours = 24,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock((hashtext(${projectId}::text))::bigint)`,
      );

      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const connection = await tx.gitHubConnection.findUnique({
        where: { projectId },
        select: {
          id: true,
          repositoryFullName: true,
          githubPatCiphertext: true,
          openPullRequestCount: true,
          openIssueCount: true,
          lastEventAt: true,
        },
      });

      let webhookEventsInWindow = 0;
      if (connection) {
        webhookEventsInWindow = await tx.gitHubWebhookEvent.count({
          where: {
            connectionId: connection.id,
            createdAt: { gte: since },
          },
        });
      }

      const incidentsTouchedInWindow = await tx.terminalIncident.count({
        where: {
          projectId,
          lastSeenAt: { gte: since },
        },
      });

      const newFingerprintsInWindow = await tx.terminalIncident.count({
        where: {
          projectId,
          firstSeenAt: { gte: since },
        },
      });

      const batchesInWindow = await tx.terminalIngestBatch.count({
        where: {
          projectId,
          createdAt: { gte: since },
        },
      });

      const activeTaskWhere: Prisma.TaskWhereInput = {
        projectId,
        status: { notIn: ['DONE', 'CANCELLED'] },
      };

      const activeCount = await tx.task.count({
        where: activeTaskWhere,
      });

      const overdueCount = await tx.task.count({
        where: {
          ...activeTaskWhere,
          deadline: { lt: now },
        },
      });

      const dueWithin7DaysCount = await tx.task.count({
        where: {
          ...activeTaskWhere,
          deadline: { gte: now, lte: in7Days },
        },
      });

      type FrictionAgg = {
        incidentTouches: number;
        batchesPosted: number;
        lastIncidentAt: Date | null;
        lastBatchAt: Date | null;
      };
      const byTask = new Map<string, FrictionAgg>();

      const incidentGroups = await tx.terminalIncident.groupBy({
        by: ['taskId'],
        where: {
          projectId,
          taskId: { not: null },
          lastSeenAt: { gte: since },
        },
        _count: { id: true },
        _max: { lastSeenAt: true },
      });
      for (const row of incidentGroups) {
        if (!row.taskId) {
          continue;
        }
        byTask.set(row.taskId, {
          incidentTouches: row._count.id,
          batchesPosted: 0,
          lastIncidentAt: row._max.lastSeenAt,
          lastBatchAt: null,
        });
      }

      const batchGroups = await tx.terminalIngestBatch.groupBy({
        by: ['taskId'],
        where: {
          projectId,
          taskId: { not: null },
          createdAt: { gte: since },
        },
        _count: { id: true },
        _max: { createdAt: true },
      });
      for (const row of batchGroups) {
        if (!row.taskId) {
          continue;
        }
        const existing = byTask.get(row.taskId) ?? {
          incidentTouches: 0,
          batchesPosted: 0,
          lastIncidentAt: null,
          lastBatchAt: null,
        };
        existing.batchesPosted = row._count.id;
        existing.lastBatchAt = row._max.createdAt;
        byTask.set(row.taskId, existing);
      }

      let tasksWithTerminalFriction: ProjectSignalTaskTerminalFriction[] = [];
      if (byTask.size > 0) {
        const taskIds = [...byTask.keys()];
        const tasks = await tx.task.findMany({
          where: { id: { in: taskIds }, projectId },
          select: {
            id: true,
            title: true,
            assigneeId: true,
            assignee: { select: { email: true, displayName: true } },
          },
        });
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        tasksWithTerminalFriction = [...byTask.entries()]
          .map(([taskId, agg]) => {
            const t = taskMap.get(taskId);
            return {
              taskId,
              title: t?.title ?? '(removed task)',
              assigneeId: t?.assigneeId ?? null,
              assigneeEmail: t?.assignee?.email ?? null,
              assigneeDisplayName: t?.assignee?.displayName ?? null,
              incidentTouchesInWindow: agg.incidentTouches,
              batchesPostedInWindow: agg.batchesPosted,
              lastIncidentAt: agg.lastIncidentAt?.toISOString() ?? null,
              lastBatchAt: agg.lastBatchAt?.toISOString() ?? null,
            };
          })
          .sort((a, b) => {
            const wa =
              a.incidentTouchesInWindow + a.batchesPostedInWindow;
            const wb =
              b.incidentTouchesInWindow + b.batchesPostedInWindow;
            return wb - wa;
          })
          .slice(0, 25);
      }

      let rest: GithubRestEnrichment | null = null;
      if (connection?.repositoryFullName && connection.githubPatCiphertext) {
        rest = await this.githubRest.enrich(
          connection.repositoryFullName,
          connection.githubPatCiphertext,
        );
      }

      /** Prefer live GitHub REST counts when PAT is configured (webhook counters start at 0). */
      const openPullRequests =
        rest?.openPullRequestsFromApi ?? connection?.openPullRequestCount ?? null;
      const openIssues =
        rest?.openIssuesFromApi ?? connection?.openIssueCount ?? null;

      const payload: ProjectSignalPayload = {
        windowHours,
        github: {
          webhookEventsInWindow,
          openPullRequests,
          openIssues,
          lastEventAt: connection?.lastEventAt?.toISOString() ?? null,
          rest,
        },
        terminal: {
          incidentsTouchedInWindow,
          newFingerprintsInWindow,
          batchesInWindow,
        },
        tasks: {
          activeCount,
          overdueCount,
          dueWithin7DaysCount,
        },
        tasksWithTerminalFriction,
      };

      return tx.projectSignalSnapshot.upsert({
        where: { projectId },
        create: {
          organizationId,
          projectId,
          windowHours,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
        update: {
          windowHours,
          payload: payload as unknown as Prisma.InputJsonValue,
          computedAt: new Date(),
        },
      });
    });
  }
}
