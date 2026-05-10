import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles()
  async list(
    @Param('organizationId') organizationId: string,
  ): Promise<{ data: Awaited<ReturnType<ProjectsService['listProjects']>> }> {
    const data = await this.projectsService.listProjects(organizationId);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PM)
  async create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<{ data: Awaited<ReturnType<ProjectsService['createProject']>> }> {
    const data = await this.projectsService.createProject(
      organizationId,
      dto,
    );
    return { data };
  }

  @Get(':projectId')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async getOne(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<{ data: Awaited<ReturnType<ProjectsService['getProjectInOrg']>> }> {
    const data = await this.projectsService.getProjectInOrg(
      projectId,
      organizationId,
    );
    return { data };
  }

  @Patch(':projectId')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async patch(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<{ data: Awaited<ReturnType<ProjectsService['updateProject']>> }> {
    const data = await this.projectsService.updateProject(
      projectId,
      organizationId,
      dto,
    );
    return { data };
  }
}
