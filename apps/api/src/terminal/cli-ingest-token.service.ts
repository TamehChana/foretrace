import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { sha256Utf8Hex } from './terminal-digest';

@Injectable()
export class CliIngestTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  private mintCliSecret(): string {
    return `ft_ck_${randomBytes(32).toString('base64url')}`;
  }

  /** Returns plaintext secret once alongside persisted metadata (digest only in DB). */
  async mintToken(
    organizationId: string,
    projectId: string,
    createdByUserId: string,
    name?: string,
  ): Promise<{
    id: string;
    name: string | null;
    createdAt: Date;
    token: string;
  }> {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const token = this.mintCliSecret();
    const digest = sha256Utf8Hex(token);

    const row = await this.prisma.cliIngestToken.create({
      data: {
        organizationId,
        projectId,
        secretDigest: digest,
        name: name ?? null,
        createdById: createdByUserId,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });
    return { ...row, token };
  }

  async listForProject(
    organizationId: string,
    projectId: string,
  ): Promise<
    {
      id: string;
      name: string | null;
      createdAt: Date;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
      createdById: string;
    }[]
  > {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    return this.prisma.cliIngestToken.findMany({
      where: { organizationId, projectId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdById: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(
    actorUserId: string,
    actorRole: Role,
    organizationId: string,
    projectId: string,
    tokenId: string,
  ): Promise<{ ok: true }> {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    const tokenRow = await this.prisma.cliIngestToken.findFirst({
      where: { id: tokenId, organizationId, projectId },
      select: { id: true, createdById: true, revokedAt: true },
    });
    if (!tokenRow) {
      throw new NotFoundException('CLI token not found');
    }
    if (tokenRow.revokedAt !== null) {
      return { ok: true };
    }

    if (actorRole === 'DEVELOPER' && tokenRow.createdById !== actorUserId) {
      throw new ForbiddenException('You may only revoke tokens you created');
    }

    await this.prisma.cliIngestToken.update({
      where: { id: tokenRow.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'CLI_TOKEN_REVOKED',
      resourceType: 'cli_ingest_token',
      resourceId: tokenRow.id,
      metadata: { projectId },
    });
    return { ok: true };
  }
}
