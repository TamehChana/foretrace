import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBody,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common/interfaces/http/raw-body-request.interface.js';
import type { Request } from 'express';

import { GithubWebhookService } from './github-webhook.service';

/**
 * Stateless GitHub delivery endpoint (verified per linked repository secret).
 */
@SkipThrottle()
@Controller()
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post('webhooks/github')
  @HttpCode(HttpStatus.OK)
  async ingest(
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-github-event') eventType: string | undefined,
    @Headers('x-hub-signature-256') signature256: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @RawBody() rawBody: Buffer | undefined,
  ): Promise<{ ok: true }> {
    const delivery = typeof deliveryId === 'string' ? deliveryId.trim() : '';
    const event = typeof eventType === 'string' ? eventType.trim() : '';
    if (!delivery || !event) {
      throw new BadRequestException(
        'Missing X-GitHub-Delivery or X-GitHub-Event',
      );
    }
    let body = rawBody;
    if ((!body || body.length === 0) && Buffer.isBuffer(req.rawBody)) {
      body = req.rawBody;
    }
    if (!body || body.length === 0) {
      throw new BadRequestException('Empty webhook body');
    }

    await this.githubWebhookService.ingest({
      deliveryId: delivery,
      eventType: event,
      signature256,
      rawBody: body,
    });
    return { ok: true };
  }
}
