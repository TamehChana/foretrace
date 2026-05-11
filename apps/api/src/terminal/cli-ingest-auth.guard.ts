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
    if (
      typeof organizationId !== 'string' ||
      typeof projectId !== 'string' ||
      row.organizationId !== organizationId ||
      row.projectId !== projectId
    ) {
      throw new ForbiddenException('CLI token is not scoped to this project');
    }

    req.cliIngestContext = {
      tokenId: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
    };

    return true;
  }
}
