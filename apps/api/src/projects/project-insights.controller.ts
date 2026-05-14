import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ProjectImpactAnalyzerService } from '../ai/project-impact-analyzer.service';

@Controller('organizations/:organizationId/projects/:projectId/insights')
export class ProjectInsightsController {
  constructor(private readonly impact: ProjectImpactAnalyzerService) {}

  /**
   * Refreshes the signal snapshot, then returns a holistic narrative (OpenAI when
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
