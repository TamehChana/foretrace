import {
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { isUuidV4 } from './is-uuid';

/** Validates `taskId` route segment before auth. */
@Injectable()
export class TaskUuidParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.params['taskId'];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new BadRequestException('Task id must be set.');
    }
    if (!isUuidV4(raw)) {
      throw new BadRequestException('Task id must be a UUID.');
    }
    return true;
  }
}
