import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { sha256Utf8Hex } from './terminal-digest';

/** Validates `Authorization: Bearer ft_ck_…` against `CliIngestToken`; sets `req.cliIngestContext`. */
@Injectable()
export class CliIngestAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawAuth = req.headers.authorization;
    if (typeof rawAuth !== 'string' || !rawAuth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer CLI token required');
    }
    const secret = rawAuth.slice('Bearer '.length).trim();
    if (
      typeof secret !== 'string' ||
      secret.length === 0 ||
      !secret.startsWith('ft_ck_')
    ) {
      throw new UnauthorizedException('Invalid CLI token shape');
    }
    const digest = sha256Utf8Hex(secret);

    const row = await this.prisma.cliIngestToken.findUnique({
      where: { secretDigest: digest },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        revokedAt: true,
      },
    });
    if (!row || row.revokedAt !== null) {
      throw new UnauthorizedException('CLI token revoked or unknown');
    }

    const organizationId = req.params['organizationId'];
    const projectId = req.params['projectId'];
    if (typeof organizationId !== 'string' || typeof projectId !== 'string') {
      throw new ForbiddenException('CLI token is not scoped to this project');
    }
    /** UUID path segments may differ by case from `@db.Uuid` values returned by Prisma. */
    const orgNorm = organizationId.toLowerCase();
    const projNorm = projectId.toLowerCase();
    if (
      row.organizationId.toLowerCase() !== orgNorm ||
      row.projectId.toLowerCase() !== projNorm
    ) {
      throw new ForbiddenException(
        `CLI token is scoped to organization ${row.organizationId} and project ${row.projectId}; ` +
          `the request URL used organization ${organizationId} and project ${projectId}. ` +
          `Set FORETRACE_ORGANIZATION_ID and FORETRACE_PROJECT_ID to match the project where you minted this token.`,
      );
    }

    req.cliIngestContext = {
      tokenId: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
    };

    return true;
  }
}
