import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { TaskUuidParamGuard } from '../common/task-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ProjectImpactAnalyzerService } from '../ai/project-impact-analyzer.service';
import { InsightFeedbackController } from './insight-feedback.controller';
import { InsightFeedbackService } from './insight-feedback.service';
import { ProjectInsightsController } from './project-insights.controller';
import { ProjectRiskController } from './project-risk.controller';
import { ProjectRiskService } from './project-risk.service';
import { GithubSignalRestEnricher } from './github-signal-rest-enricher';
import { ProjectSignalsController } from './project-signals.controller';
import { ProjectSignalsService } from './project-signals.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [AuthModule, AlertsModule, AuditModule, AiModule],
  controllers: [
    ProjectsController,
    TasksController,
    ProjectSignalsController,
    ProjectRiskController,
    ProjectInsightsController,
    InsightFeedbackController,
  ],
  providers: [
    ProjectsService,
    GithubSignalRestEnricher,
    ProjectSignalsService,
    ProjectRiskService,
    ProjectImpactAnalyzerService,
    InsightFeedbackService,
    TasksService,
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    TaskUuidParamGuard,
  ],
  exports: [ProjectsService, ProjectSignalsService],
})
export class ProjectsModule {}
