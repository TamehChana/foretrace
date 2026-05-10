import { Controller, Get } from '@nestjs/common';
import type { HealthPayload } from '@foretrace/shared';
import { API_NAME, healthPayloadSchema } from '@foretrace/shared';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthPayload {
    return healthPayloadSchema.parse({
      ok: true,
      service: API_NAME,
      version: '0.0.1',
    });
  }
}
