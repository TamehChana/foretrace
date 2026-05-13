import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { TaskUuidParamGuard } from '../common/task-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { BodyDtoPipe } from '../common/pipes/body-dto.pipe';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('organizations/:organizationId/projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
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
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<TasksService['listTasks']>> }> {
    const data = await this.tasksService.listTasks(
      projectId,
      organizationId,
      req.user!.id,
    );
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN)
  async create(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body(new BodyDtoPipe(CreateTaskDto)) dto: CreateTaskDto,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<TasksService['createTask']>> }> {
    const data = await this.tasksService.createTask(
      projectId,
      organizationId,
      req.user!.id,
      dto,
    );
    return { data };
  }

  @Get(':taskId')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    TaskUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async getOne(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<TasksService['getTask']>> }> {
    const data = await this.tasksService.getTask(
      taskId,
      projectId,
      organizationId,
      req.user!.id,
    );
    return { data };
  }

  @Patch(':taskId')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    TaskUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async patch(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body(new BodyDtoPipe(UpdateTaskDto)) dto: UpdateTaskDto,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<TasksService['updateTask']>> }> {
    const data = await this.tasksService.updateTask(
      taskId,
      projectId,
      organizationId,
      req.user!.id,
      dto,
    );
    return { data };
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    TaskUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async delete(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.tasksService.deleteTask(
      taskId,
      projectId,
      organizationId,
      req.user!.id,
    );
  }
}
