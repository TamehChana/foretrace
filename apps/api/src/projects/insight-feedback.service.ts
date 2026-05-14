import { Injectable } from '@nestjs/common';
import type { InsightFeedbackKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

@Injectable()
export class InsightFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(
    projectId: string,
    organizationId: string,
    actorUserId: string,
    input: {
      kind: InsightFeedbackKind;
      helpful: boolean;
      comment: string | null;
    },
  ) {
    await this.projects.getProjectInOrg(projectId, organizationId);
    return this.prisma.insightFeedback.create({
      data: {
        organizationId,
        projectId,
        userId: actorUserId,
        kind: input.kind,
        helpful: input.helpful,
        comment: input.comment,
      },
      select: { id: true, createdAt: true },
    });
  }
}
