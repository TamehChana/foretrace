import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { TerminalIncidentsService } from './terminal-incidents.service';

@Controller('organizations/:organizationId/projects/:projectId/terminal')
export class TerminalIncidentsController {
  constructor(private readonly incidents: TerminalIncidentsService) {}

  @Get('incidents')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async list(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Req() req: Request,
  ): Promise<{
    data: Awaited<ReturnType<TerminalIncidentsService['listForProject']>>;
  }> {
    const data = await this.incidents.listForProject(
      organizationId,
      projectId,
      req.user!.id,
      limit,
    );
    return { data };
  }
}
