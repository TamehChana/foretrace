import {
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { isUuidV4 } from './is-uuid';

/** Validates `projectId` route segment before auth (400 vs 401 ordering). */
@Injectable()
export class ProjectUuidParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.params['projectId'];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new BadRequestException('Project id must be set.');
    }
    if (!isUuidV4(raw)) {
      throw new BadRequestException('Project id must be a UUID.');
    }
    return true;
  }
}
