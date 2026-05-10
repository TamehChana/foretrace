import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { TaskUuidParamGuard } from '../common/task-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController, TasksController],
  providers: [
    ProjectsService,
    TasksService,
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    TaskUuidParamGuard,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
