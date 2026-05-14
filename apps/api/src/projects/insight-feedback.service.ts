import { Injectable } from '@nestjs/common';
import type { InsightFeedbackKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

export type InsightFeedbackListRow = {
  id: string;
  createdAt: Date;
  kind: InsightFeedbackKind;
  helpful: boolean;
  comment: string | null;
  project: { id: string; name: string };
  user: { id: string; email: string; displayName: string | null };
};

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

  /** PM/Admin dashboard: recent thumbs on Trace Analyst outputs for tuning and QA. */
  async listForOrganization(
    organizationId: string,
    limit = 80,
  ): Promise<InsightFeedbackListRow[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.insightFeedback.findMany({
      where: { organizationId },
      select: {
        id: true,
        createdAt: true,
        kind: true,
        helpful: true,
        comment: true,
        project: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
