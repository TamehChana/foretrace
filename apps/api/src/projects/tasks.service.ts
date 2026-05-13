import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TaskPriority, TaskStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async assertAssigneeInOrg(
    assigneeId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: assigneeId,
          organizationId,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException(
        'Assignee must be a member of this organization.',
      );
    }
  }

  private developerSeesTaskWhere(viewerUserId: string): Prisma.TaskWhereInput {
    return {
      OR: [
        { assigneeId: viewerUserId },
        { assigneeId: null, createdById: viewerUserId },
      ],
    };
  }

  async listTasks(
    projectId: string,
    organizationId: string,
    viewerUserId: string,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: viewerUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    const where: Prisma.TaskWhereInput =
      membership.role === Role.DEVELOPER
        ? { projectId, ...this.developerSeesTaskWhere(viewerUserId) }
        : { projectId };

    return this.prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        deadline: true,
        progress: true,
        assigneeId: true,
        createdById: true,
        githubIssueNumber: true,
        lastGithubActivityAt: true,
        lastGithubActorLogin: true,
        lastGithubLinkedUserId: true,
        lastGithubLinkedUser: {
          select: { id: true, displayName: true, email: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTask(
    taskId: string,
    projectId: string,
    organizationId: string,
    viewerUserId: string,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: viewerUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    const where: Prisma.TaskWhereInput = { id: taskId, projectId };
    if (membership.role === Role.DEVELOPER) {
      Object.assign(where, this.developerSeesTaskWhere(viewerUserId));
    }

    const task = await this.prisma.task.findFirst({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        deadline: true,
        progress: true,
        assigneeId: true,
        createdById: true,
        githubIssueNumber: true,
        lastGithubActivityAt: true,
        lastGithubActorLogin: true,
        lastGithubLinkedUserId: true,
        lastGithubLinkedUser: {
          select: { id: true, displayName: true, email: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async createTask(
    projectId: string,
    organizationId: string,
    createdById: string,
    dto: CreateTaskDto,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: createdById,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }
    if (membership.role === Role.DEVELOPER) {
      throw new ForbiddenException(
        'Only PMs and admins can create tasks.',
      );
    }

    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(dto.assigneeId, organizationId);
    }

    return this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: dto.status ?? TaskStatus.TODO,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        assigneeId: dto.assigneeId ?? null,
        progress: dto.progress !== undefined ? dto.progress : 0,
        createdById,
        ...(dto.githubIssueNumber !== undefined && dto.githubIssueNumber !== null
          ? { githubIssueNumber: dto.githubIssueNumber }
          : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        deadline: true,
        progress: true,
        assigneeId: true,
        createdById: true,
        githubIssueNumber: true,
        lastGithubActivityAt: true,
        lastGithubActorLogin: true,
        lastGithubLinkedUserId: true,
        lastGithubLinkedUser: {
          select: { id: true, displayName: true, email: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateTask(
    taskId: string,
    projectId: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateTaskDto,
  ) {
    const task = await this.getTask(taskId, projectId, organizationId, actorUserId);

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    const requestedTitle = dto.title !== undefined;
    const requestedDescription = dto.description !== undefined;
    const requestedPriority = dto.priority !== undefined;
    const requestedDeadline = dto.deadline !== undefined;
    const requestedAssignee = dto.assigneeId !== undefined;
    const requestedStatus = dto.status !== undefined;
    const requestedProgress = dto.progress !== undefined;
    const requestedGithubIssue = dto.githubIssueNumber !== undefined;

    const anyMetadataOrAssignment =
      requestedTitle ||
      requestedDescription ||
      requestedPriority ||
      requestedDeadline ||
      requestedAssignee ||
      requestedGithubIssue;

    if (membership.role === Role.DEVELOPER) {
      const canUpdateStatusOrProgress =
        task.assigneeId === actorUserId ||
        (task.assigneeId === null && task.createdById === actorUserId);

      if (anyMetadataOrAssignment) {
        throw new ForbiddenException(
          'Developers may only update task status and progress. Ask a PM or admin to change assignment, schedule, or details.',
        );
      }

      if (
        (requestedStatus || requestedProgress) &&
        !canUpdateStatusOrProgress
      ) {
        throw new ForbiddenException(
          'You may only update status or progress when this task is assigned to you, or when you created it and it is still unassigned.',
        );
      }
    }

    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(dto.assigneeId, organizationId);
    }

    const data: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
      deadline?: Date | null;
      assigneeId?: string | null;
      progress?: number;
      githubIssueNumber?: number | null;
    } = {};

    if (dto.title !== undefined) {
      data.title = dto.title;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.deadline !== undefined) {
      data.deadline =
        dto.deadline === null ? null : new Date(dto.deadline);
    }
    if (dto.assigneeId !== undefined) {
      data.assigneeId = dto.assigneeId;
    }
    if (dto.progress !== undefined) {
      data.progress = dto.progress;
    }
    if (dto.githubIssueNumber !== undefined) {
      data.githubIssueNumber = dto.githubIssueNumber;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No updates provided');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        deadline: true,
        progress: true,
        assigneeId: true,
        createdById: true,
        githubIssueNumber: true,
        lastGithubActivityAt: true,
        lastGithubActorLogin: true,
        lastGithubLinkedUserId: true,
        lastGithubLinkedUser: {
          select: { id: true, displayName: true, email: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * **`ADMIN`** / **`PM`**: delete any task in the project.
   * **`DEVELOPER`**: only tasks they **`created`** (`createdById`).
   */
  async deleteTask(
    taskId: string,
    projectId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const task = await this.getTask(
      taskId,
      projectId,
      organizationId,
      actorUserId,
    );
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }
    if (
      membership.role === Role.DEVELOPER &&
      task.createdById !== actorUserId
    ) {
      throw new ForbiddenException(
        'Developers may only delete tasks they created.',
      );
    }
    await this.prisma.task.delete({
      where: { id: taskId },
    });
  }
}
