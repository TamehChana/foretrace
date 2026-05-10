import {
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { isUuidV4 } from '../common/is-uuid';

/**
 * Runs **before** `AuthenticatedGuard` so malformed `:organizationId` returns 400 rather than 401.
 */
@Injectable()
export class OrganizationUuidParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.params['organizationId'];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new BadRequestException('Organization id must be set.');
    }
    if (!isUuidV4(raw)) {
      throw new BadRequestException('Organization id must be a UUID.');
    }
    return true;
  }
}
