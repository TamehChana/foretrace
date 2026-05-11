import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async listForOrganization(organizationId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
