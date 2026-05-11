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
import { ProjectSignalsService } from './project-signals.service';

@Controller('organizations/:organizationId/projects/:projectId/signals')
export class ProjectSignalsController {
  constructor(private readonly signals: ProjectSignalsService) {}

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
    data: Awaited<ReturnType<ProjectSignalsService['getSnapshot']>>;
  }> {
    const data = await this.signals.getSnapshot(projectId, organizationId);
    return { data };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async refresh(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<{
    data: Awaited<ReturnType<ProjectSignalsService['refreshSnapshot']>>;
  }> {
    const data = await this.signals.refreshSnapshot(projectId, organizationId);
    return { data };
  }
}
