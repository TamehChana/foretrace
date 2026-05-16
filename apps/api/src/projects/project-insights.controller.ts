import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ProjectImpactAnalyzerService } from '../ai/project-impact-analyzer.service';
import { TraceAnalystContextService } from '../ai/trace-analyst-context.service';
import { ProjectsService } from './projects.service';

@Controller('organizations/:organizationId/projects/:projectId/insights')
export class ProjectInsightsController {
  constructor(
    private readonly impact: ProjectImpactAnalyzerService,
    private readonly traceAnalyst: TraceAnalystContextService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('readiness')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async readiness(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.getProjectInOrg(projectId, organizationId);
    const data = await this.traceAnalyst.getReadiness(projectId, organizationId);
    return { data };
  }

  @Get('history')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async history(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 10;
    const data = await this.impact.listHistory(
      projectId,
      organizationId,
      Number.isFinite(n) ? n : 10,
    );
    return { data };
  }

  /**
   * Refreshes the signal snapshot, then returns a Trace Analyst narrative (OpenAI when
   * configured, otherwise a deterministic summary). Does not persist.
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async analyze(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<{ data: Awaited<ReturnType<ProjectImpactAnalyzerService['analyze']>> }> {
    const data = await this.impact.analyze(projectId, organizationId);
    return { data };
  }
}
