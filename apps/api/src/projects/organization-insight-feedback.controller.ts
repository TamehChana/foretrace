import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { InsightFeedbackService } from './insight-feedback.service';

@Controller('organizations/:organizationId')
export class OrganizationInsightFeedbackController {
  constructor(private readonly feedback: InsightFeedbackService) {}

  /**
   * Lists recent Trace Analyst thumbs (risk summary vs on-demand read) for PM/Admin review.
   */
  @Get('insight-feedback')
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PM)
  async list(
    @Param('organizationId') organizationId: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: Awaited<ReturnType<InsightFeedbackService['listForOrganization']>>;
  }> {
    const parsed =
      limitRaw !== undefined && limitRaw !== ''
        ? Number.parseInt(limitRaw, 10)
        : NaN;
    const limit = Number.isFinite(parsed) ? parsed : 80;
    const data = await this.feedback.listForOrganization(organizationId, limit);
    return { data };
  }
}
