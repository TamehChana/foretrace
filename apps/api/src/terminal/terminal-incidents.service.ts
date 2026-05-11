import { Injectable } from '@nestjs/common';

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
    limit?: number,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const raw =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.trunc(limit)
        : DEFAULT_LIMIT;
    const take = Math.min(Math.max(raw, 1), MAX_LIMIT);

    return this.prisma.terminalIncident.findMany({
      where: { organizationId, projectId },
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
