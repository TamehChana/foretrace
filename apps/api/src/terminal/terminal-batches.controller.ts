import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { TerminalIngestBatchInput } from '@foretrace/shared';
import type { Request } from 'express';

import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ParseTerminalIngestBatchPipe } from './parse-terminal-ingest-batch.pipe';
import { CliIngestAuthGuard } from './cli-ingest-auth.guard';
import type { CliTokenContext } from './terminal-ingest.service';
import { TerminalIngestService } from './terminal-ingest.service';

@SkipThrottle()
@Controller('organizations/:organizationId/projects/:projectId/terminal')
export class TerminalBatchesController {
  constructor(private readonly ingest: TerminalIngestService) {}

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    CliIngestAuthGuard,
  )
  async postBatch(
    @Req() req: Request,
    @Body(ParseTerminalIngestBatchPipe) body: TerminalIngestBatchInput,
  ): Promise<{ data: Awaited<ReturnType<TerminalIngestService['ingest']>> }> {
    const ctx = req.cliIngestContext as CliTokenContext;
    const data = await this.ingest.ingest(body, ctx);
    return { data };
  }
}
