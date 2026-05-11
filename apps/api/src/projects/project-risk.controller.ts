import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ProjectRiskService } from './project-risk.service';

@Controller('organizations/:organizationId/projects/:projectId/risk')
export class ProjectRiskController {
  constructor(private readonly risk: ProjectRiskService) {}

  @Get()
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async get(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<{
    data: Awaited<ReturnType<ProjectRiskService['getEvaluation']>>;
  }> {
    const data = await this.risk.getEvaluation(projectId, organizationId);
    return { data };
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async evaluate(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<{
    data: Awaited<ReturnType<ProjectRiskService['evaluateAndPersist']>>;
  }> {
    const data = await this.risk.evaluateAndPersist(projectId, organizationId);
    return { data };
  }
}
