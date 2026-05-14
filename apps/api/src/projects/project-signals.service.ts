import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import type { GithubRestEnrichment } from './github-signal-rest-enricher';
import { GithubSignalRestEnricher } from './github-signal-rest-enricher';
export type { GithubRestEnrichment } from './github-signal-rest-enricher';

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

export type ProjectSignalTerminalByMintedUser = {
  userId: string;
  email: string;
  displayName: string | null;
  batchesInWindow: number;
  linesInWindow: number;
  incidentRowsLinkedToMintedBatchesInWindow: number;
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
    /** Active tasks with deadline in the next 7 days (includes the next 3 days). */
    dueWithin7DaysCount: number;
    /** Active tasks with deadline in the next 3 days (subset of `dueWithin7DaysCount`). */
    dueWithin3DaysCount: number;
    /** Active tasks with deadline between 3 and 7 days from now (for risk bucketing). */
    dueBetween4And7DaysCount: number;
    /** Active tasks due within 7 days with progress still below 35%. */
    dueSoonLowProgressCount: number;
  };
  /** Task-scoped terminal when CLI sends `taskId`. */
  tasksWithTerminalFriction?: ProjectSignalTaskTerminalFriction[];
  /** Terminal batches in the window grouped by the user who minted the ingest token. */
  terminalByMintedTokenUser?: ProjectSignalTerminalByMintedUser[];
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
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
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

      const dueWithin3DaysCount = await tx.task.count({
        where: {
          ...activeTaskWhere,
          deadline: { gte: now, lte: in3Days },
        },
      });

      const dueBetween4And7DaysCount = await tx.task.count({
        where: {
          ...activeTaskWhere,
          deadline: { gt: in3Days, lte: in7Days },
        },
      });

      const dueSoonLowProgressCount = await tx.task.count({
        where: {
          ...activeTaskWhere,
          deadline: { gte: now, lte: in7Days },
          progress: { lt: 35 },
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

      const byMint = new Map<
        string,
        { batches: number; lines: number; incidents: number }
      >();
      const batchRowsForUsers = await tx.terminalIngestBatch.findMany({
        where: { projectId, createdAt: { gte: since } },
        select: { lineCount: true, metadata: true },
      });
      for (const br of batchRowsForUsers) {
        const meta = br.metadata as Record<string, unknown> | null;
        const uid =
          meta && typeof meta.mintedByUserId === 'string'
            ? meta.mintedByUserId
            : null;
        if (!uid) {
          continue;
        }
        const cur = byMint.get(uid) ?? {
          batches: 0,
          lines: 0,
          incidents: 0,
        };
        cur.batches += 1;
        cur.lines += br.lineCount;
        byMint.set(uid, cur);
      }

      const incidentsWithBatch = await tx.terminalIncident.findMany({
        where: {
          projectId,
          lastSeenAt: { gte: since },
          batchId: { not: null },
        },
        select: { batch: { select: { metadata: true } } },
      });
      for (const ir of incidentsWithBatch) {
        const meta = ir.batch?.metadata as Record<string, unknown> | null;
        const uid =
          meta && typeof meta.mintedByUserId === 'string'
            ? meta.mintedByUserId
            : null;
        if (!uid) {
          continue;
        }
        const cur = byMint.get(uid) ?? {
          batches: 0,
          lines: 0,
          incidents: 0,
        };
        cur.incidents += 1;
        byMint.set(uid, cur);
      }

      let terminalByMintedTokenUser: ProjectSignalTerminalByMintedUser[] = [];
      if (byMint.size > 0) {
        const mintIds = [...byMint.keys()];
        const mintUsers = await tx.user.findMany({
          where: { id: { in: mintIds } },
          select: { id: true, email: true, displayName: true },
        });
        const mintMap = new Map(mintUsers.map((u) => [u.id, u]));
        terminalByMintedTokenUser = mintIds
          .map((id) => {
            const u = mintMap.get(id);
            const g = byMint.get(id)!;
            return {
              userId: id,
              email: u?.email ?? id,
              displayName: u?.displayName ?? null,
              batchesInWindow: g.batches,
              linesInWindow: g.lines,
              incidentRowsLinkedToMintedBatchesInWindow: g.incidents,
            };
          })
          .sort(
            (a, b) =>
              b.batchesInWindow +
              b.incidentRowsLinkedToMintedBatchesInWindow -
              (a.batchesInWindow +
                a.incidentRowsLinkedToMintedBatchesInWindow),
          )
          .slice(0, 24);
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
          dueWithin3DaysCount,
          dueBetween4And7DaysCount,
          dueSoonLowProgressCount,
        },
        tasksWithTerminalFriction,
        terminalByMintedTokenUser,
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

  /**
   * Refreshes persisted snapshots for many projects (cron / ops). Non-archived
   * projects only; failures are collected so one bad project does not abort the batch.
   */
  async refreshAllSnapshots(opts?: { limit?: number }): Promise<{
    attempted: number;
    refreshed: number;
    failures: { projectId: string; message: string }[];
  }> {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    const projects = await this.prisma.project.findMany({
      where: { archivedAt: null },
      select: { id: true, organizationId: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    const failures: { projectId: string; message: string }[] = [];
    let refreshed = 0;
    for (const p of projects) {
      try {
        await this.refreshSnapshot(p.id, p.organizationId);
        refreshed += 1;
      } catch (e: unknown) {
        failures.push({
          projectId: p.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return {
      attempted: projects.length,
      refreshed,
      failures,
    };
  }
}

/** Safe JSON for LLM prompts — strips raw terminal line payloads. */
export function compactProjectSignalEvidenceForAi(
  p: ProjectSignalPayload,
): Record<string, unknown> {
  const rest = p.github.rest;
  return {
    windowHours: p.windowHours,
    tasks: p.tasks,
    terminal: p.terminal,
    github: {
      webhookEventsInWindow: p.github.webhookEventsInWindow,
      openPullRequests: p.github.openPullRequests,
      openIssues: p.github.openIssues,
      lastEventAt: p.github.lastEventAt,
      rest: rest
        ? {
            fetchedAt: rest.fetchedAt,
            combinedStatus: rest.combinedStatus,
            defaultBranch: rest.defaultBranch,
            openPullRequestsFromApi: rest.openPullRequestsFromApi,
            openIssuesFromApi: rest.openIssuesFromApi,
            lastRepositoryPushAt: rest.lastRepositoryPushAt,
            mergedPullRequestsLast7Days: rest.mergedPullRequestsLast7Days,
          }
        : null,
    },
    tasksWithTerminalFriction: (p.tasksWithTerminalFriction ?? []).slice(
      0,
      15,
    ),
    terminalByMintedTokenUser: (p.terminalByMintedTokenUser ?? []).slice(
      0,
      15,
    ),
  };
}
