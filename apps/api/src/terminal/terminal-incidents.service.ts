import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class TerminalIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(
    organizationId: string,
    projectId: string,
    viewerUserId: string,
    limit?: number,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: viewerUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    const raw =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.trunc(limit)
        : DEFAULT_LIMIT;
    const take = Math.min(Math.max(raw, 1), MAX_LIMIT);

    const where: Prisma.TerminalIncidentWhereInput = {
      organizationId,
      projectId,
    };
    if (membership.role === Role.DEVELOPER) {
      where.OR = [
        { taskId: null },
        { task: { assigneeId: viewerUserId } },
        { task: { assigneeId: null, createdById: viewerUserId } },
      ];
    }

    return this.prisma.terminalIncident.findMany({
      where,
      select: {
        id: true,
        category: true,
        excerpt: true,
        fingerprint: true,
        firstSeenAt: true,
        lastSeenAt: true,
        occurrenceCount: true,
        taskId: true,
        batchId: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take,
    });
  }
}
