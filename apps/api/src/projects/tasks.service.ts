import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TaskPriority, TaskStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { GithubSignalRestEnricher } from './github-signal-rest-enricher';
import { ProjectsService } from './projects.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly githubSignalRest: GithubSignalRestEnricher,
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
        lastGithubPullRequestNumber: true,
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
        lastGithubPullRequestNumber: true,
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
    if (membership.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only organization admins can create tasks.',
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
        ...(dto.githubPullRequestNumber !== undefined &&
        dto.githubPullRequestNumber !== null
          ? { lastGithubPullRequestNumber: dto.githubPullRequestNumber }
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
        lastGithubPullRequestNumber: true,
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
    const requestedGithubPr = dto.githubPullRequestNumber !== undefined;

    const anyMetadataOrAssignment =
      requestedTitle ||
      requestedDescription ||
      requestedPriority ||
      requestedDeadline ||
      requestedAssignee ||
      requestedGithubIssue ||
      requestedGithubPr;

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
      lastGithubPullRequestNumber?: number | null;
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
    if (dto.githubPullRequestNumber !== undefined) {
      data.lastGithubPullRequestNumber = dto.githubPullRequestNumber;
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
        lastGithubPullRequestNumber: true,
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

  async listTaskGithubActivity(
    taskId: string,
    projectId: string,
    organizationId: string,
    viewerUserId: string,
    limit = 30,
  ) {
    await this.getTask(taskId, projectId, organizationId, viewerUserId);
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.taskGitHubActivity.findMany({
      where: { taskId },
      select: {
        id: true,
        occurredAt: true,
        eventType: true,
        action: true,
        actorLogin: true,
        pullRequestNumber: true,
        summary: true,
        linkedUser: {
          select: { id: true, displayName: true, email: true },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take,
    });
  }

  async getTaskGithubCheckStatus(
    taskId: string,
    projectId: string,
    organizationId: string,
    viewerUserId: string,
    pullNumberOverride?: number,
  ): Promise<
    | {
        ok: true;
        pullNumber: number;
        combinedStatus: string | null;
        headSha: string | null;
        note:
          | 'pat_or_pr_unavailable'
          | 'pr_not_readable'
          | 'legacy_status_empty'
          | null;
      }
    | { ok: false; reason: string }
  > {
    const task = await this.getTask(taskId, projectId, organizationId, viewerUserId);
    const conn = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: {
        repositoryFullName: true,
        githubPatCiphertext: true,
      },
    });
    if (!conn) {
      return { ok: false, reason: 'no_github_connection' };
    }
    const prNum =
      pullNumberOverride != null &&
      Number.isFinite(pullNumberOverride) &&
      pullNumberOverride > 0
        ? Math.trunc(pullNumberOverride)
        : task.lastGithubPullRequestNumber;
    if (prNum == null || prNum < 1) {
      return { ok: false, reason: 'no_pull_request_number' };
    }
    const st = await this.githubSignalRest.getPullRequestCombinedStatus(
      conn.repositoryFullName,
      conn.githubPatCiphertext,
      prNum,
    );
    let note:
      | 'pat_or_pr_unavailable'
      | 'pr_not_readable'
      | 'legacy_status_empty'
      | null = null;
    if (st.detail === 'missing_pat' || st.detail === 'decrypt_failed') {
      note = 'pat_or_pr_unavailable';
    } else if (
      st.detail === 'pull_request_not_found' ||
      st.detail === 'pull_request_forbidden'
    ) {
      note = 'pr_not_readable';
    } else if (st.detail === 'status_unavailable') {
      note = st.headSha ? 'legacy_status_empty' : 'pat_or_pr_unavailable';
    }
    return {
      ok: true,
      pullNumber: prNum,
      combinedStatus: st.combinedStatus,
      headSha: st.headSha,
      note,
    };
  }

  /**
   * One-shot: read linked GitHub issue/PR via REST and align `progress` / `status`
   * (for when the issue was already closed before webhooks or linking were set up).
   */
  async reconcileGithubIssueProgress(
    taskId: string,
    projectId: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<
    | {
        ok: true;
        updated: boolean;
        progress: number;
        status: TaskStatus;
        note:
          | null
          | 'already_in_sync'
          | 'github_pr_closed_without_merge'
          | 'github_state_open';
      }
    | {
        ok: false;
        reason:
          | 'no_github_connection'
          | 'missing_github_pat'
          | 'github_not_found'
          | 'github_forbidden'
          | 'github_bad_response'
          | 'no_github_issue_number';
      }
  > {
    const task = await this.getTask(taskId, projectId, organizationId, actorUserId);
    if (task.githubIssueNumber == null || task.githubIssueNumber < 1) {
      return { ok: false, reason: 'no_github_issue_number' };
    }

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
    if (membership.role === Role.DEVELOPER) {
      const canUpdateStatusOrProgress =
        task.assigneeId === actorUserId ||
        (task.assigneeId === null && task.createdById === actorUserId);
      if (!canUpdateStatusOrProgress) {
        throw new ForbiddenException(
          'You may only sync GitHub state for tasks assigned to you, or tasks you created while unassigned.',
        );
      }
    }

    const conn = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: {
        repositoryFullName: true,
        githubPatCiphertext: true,
      },
    });
    if (!conn) {
      return { ok: false, reason: 'no_github_connection' };
    }

    const view = await this.githubSignalRest.fetchRepoIssueOrPullView(
      conn.repositoryFullName,
      conn.githubPatCiphertext,
      task.githubIssueNumber,
    );
    if (!view.ok) {
      if (view.detail === 'missing_pat' || view.detail === 'decrypt_failed') {
        return { ok: false, reason: 'missing_github_pat' };
      }
      if (view.detail === 'not_found') {
        return { ok: false, reason: 'github_not_found' };
      }
      if (view.detail === 'forbidden') {
        return { ok: false, reason: 'github_forbidden' };
      }
      return { ok: false, reason: 'github_bad_response' };
    }

    let nextProgress: number;
    let nextStatus: TaskStatus;
    let note:
      | null
      | 'already_in_sync'
      | 'github_pr_closed_without_merge'
      | 'github_state_open' = null;

    if (view.state === 'open') {
      nextProgress = 0;
      nextStatus = TaskStatus.IN_PROGRESS;
      note = 'github_state_open';
    } else if (view.isPullRequest && !view.merged) {
      return {
        ok: true,
        updated: false,
        progress: task.progress,
        status: task.status as TaskStatus,
        note: 'github_pr_closed_without_merge',
      };
    } else {
      nextProgress = 100;
      nextStatus = TaskStatus.DONE;
    }

    if (task.progress === nextProgress && task.status === nextStatus) {
      return {
        ok: true,
        updated: false,
        progress: task.progress,
        status: task.status as TaskStatus,
        note: 'already_in_sync',
      };
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { progress: nextProgress, status: nextStatus },
      select: { progress: true, status: true },
    });

    return {
      ok: true,
      updated: true,
      progress: updated.progress,
      status: updated.status,
      note,
    };
  }
}
