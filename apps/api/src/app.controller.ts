import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthPayload } from '@foretrace/shared';
import { API_NAME, healthPayloadSchema } from '@foretrace/shared';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('health')
  getHealth(): HealthPayload {
    const version =
      process.env.FORETRACE_BUILD_ID?.trim() ||
      process.env.npm_package_version ||
      '0.0.1';
    return healthPayloadSchema.parse({
      ok: true,
      service: API_NAME,
      version,
    });
  }

  /** Readiness: verifies database connectivity (for orchestrators / load balancers). */
  @SkipThrottle()
  @Get('health/ready')
  async getHealthReady(): Promise<{ ok: true }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
