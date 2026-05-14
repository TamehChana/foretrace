import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BodyDtoPipe } from '../common/pipes/body-dto.pipe';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { CreateInsightFeedbackDto } from './dto/create-insight-feedback.dto';
import { InsightFeedbackService } from './insight-feedback.service';

@Controller('organizations/:organizationId/projects/:projectId')
export class InsightFeedbackController {
  constructor(private readonly feedback: InsightFeedbackService) {}

  @Post('insight-feedback')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async create(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body(new BodyDtoPipe(CreateInsightFeedbackDto)) dto: CreateInsightFeedbackDto,
    @Req() req: Request,
  ): Promise<{
    data: Awaited<ReturnType<InsightFeedbackService['create']>>;
  }> {
    const data = await this.feedback.create(
      projectId,
      organizationId,
      req.user!.id,
      {
        kind: dto.kind,
        helpful: dto.helpful,
        comment:
          dto.comment !== undefined && dto.comment !== null && dto.comment !== ''
            ? dto.comment
            : null,
      },
    );
    return { data };
  }
}
