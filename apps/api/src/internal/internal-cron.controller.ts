import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { ProjectSignalsService } from '../projects/project-signals.service';

/**
 * Secured HTTP hooks for external schedulers (GitHub Actions, Render cron, etc.).
 * Set `FORETRACE_CRON_SECRET` on the API and send the same value in header
 * `X-Foretrace-Cron-Secret`.
 */
@Controller('internal/cron')
export class InternalCronController {
  constructor(private readonly signals: ProjectSignalsService) {}

  @Post('refresh-project-snapshots')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async refreshProjectSnapshots(
    @Headers('x-foretrace-cron-secret') cronSecret: string | undefined,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: Awaited<ReturnType<ProjectSignalsService['refreshAllSnapshots']>>;
  }> {
    const expected = process.env.FORETRACE_CRON_SECRET?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'FORETRACE_CRON_SECRET is not set; scheduled snapshot refresh is disabled.',
      );
    }
    if ((cronSecret ?? '').trim() !== expected) {
      throw new UnauthorizedException();
    }
    let limit = 80;
    if (limitRaw !== undefined && String(limitRaw).trim() !== '') {
      const n = parseInt(String(limitRaw), 10);
      if (Number.isFinite(n)) {
        limit = n;
      }
    }
    const data = await this.signals.refreshAllSnapshots({ limit });
    return { data };
  }
}
