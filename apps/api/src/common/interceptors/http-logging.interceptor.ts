import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    const started = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const ms = Date.now() - started;
        this.log.log(
          `${requestId} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`,
        );
      }),
    );
  }
}
