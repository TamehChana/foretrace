import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

export type ProjectSignalPayload = {
  windowHours: number;
  github: {
    webhookEventsInWindow: number;
    openPullRequests: number | null;
    openIssues: number | null;
    lastEventAt: string | null;
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
        `Background signal snapshot refresh failed for project ${projectId}: ${
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

    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const connection = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: {
        id: true,
        openPullRequestCount: true,
        openIssueCount: true,
        lastEventAt: true,
      },
    });

    let webhookEventsInWindow = 0;
    if (connection) {
      webhookEventsInWindow = await this.prisma.gitHubWebhookEvent.count({
        where: {
          connectionId: connection.id,
          createdAt: { gte: since },
        },
      });
    }

    const incidentsTouchedInWindow = await this.prisma.terminalIncident.count({
      where: {
        projectId,
        lastSeenAt: { gte: since },
      },
    });

    const newFingerprintsInWindow = await this.prisma.terminalIncident.count({
      where: {
        projectId,
        firstSeenAt: { gte: since },
      },
    });

    const batchesInWindow = await this.prisma.terminalIngestBatch.count({
      where: {
        projectId,
        createdAt: { gte: since },
      },
    });

    const activeTaskWhere: Prisma.TaskWhereInput = {
      projectId,
      status: { notIn: ['DONE', 'CANCELLED'] },
    };

    const activeCount = await this.prisma.task.count({
      where: activeTaskWhere,
    });

    const overdueCount = await this.prisma.task.count({
      where: {
        ...activeTaskWhere,
        deadline: { lt: now },
      },
    });

    const dueWithin7DaysCount = await this.prisma.task.count({
      where: {
        ...activeTaskWhere,
        deadline: { gte: now, lte: in7Days },
      },
    });

    const payload: ProjectSignalPayload = {
      windowHours,
      github: {
        webhookEventsInWindow,
        openPullRequests: connection?.openPullRequestCount ?? null,
        openIssues: connection?.openIssueCount ?? null,
        lastEventAt: connection?.lastEventAt?.toISOString() ?? null,
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
    };

    return this.prisma.projectSignalSnapshot.upsert({
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
  }
}
