import {
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@prisma/client';

import { isUuidV4 } from '../../common/is-uuid';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Enforces organization scope from `params.organizationId` (preferred) or
 * `X-Organization-Id` header, then checks `Membership.role` when `@Roles(...)` lists roles.
 *
 * Run after `AuthenticatedGuard` so `request.user` exists.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  resolveOrganizationId(req: Request): string | undefined {
    const fromParam = req.params['organizationId'];
    if (typeof fromParam === 'string' && fromParam.length > 0) {
      return fromParam;
    }
    const raw = req.headers['x-organization-id'];
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (Array.isArray(raw) && raw[0]) {
      return String(raw[0]).trim();
    }
    return undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.id;

    if (request.isAuthenticated?.() !== true || !userId) {
      throw new UnauthorizedException('Sign in required');
    }

    const orgId = this.resolveOrganizationId(request);
    if (!orgId) {
      throw new BadRequestException(
        'Organization scope is required (path `organizationId` or `X-Organization-Id`).',
      );
    }
    if (!isUuidV4(orgId)) {
      throw new BadRequestException('Organization id must be a UUID.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role for this organization');
    }

    return true;
  }
}
