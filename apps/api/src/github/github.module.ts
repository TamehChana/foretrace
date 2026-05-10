import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { GithubConnectionService } from './github-connection.service';
import { GithubIntegrationController } from './github-integration.controller';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, ProjectsModule],
  controllers: [GithubWebhookController, GithubIntegrationController],
  providers: [
    GithubWebhookService,
    GithubConnectionService,
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
  ],
})
export class GithubModule {}
