import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { encryptForStorage, isSecretConfigured } from '../crypto/app-secret-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { normalizeRepositoryFullName } from './github-webhook-verify';
import type { CreateGitHubConnectionDto } from './dto/create-github-connection.dto';

@Injectable()
export class GithubConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private publicApiBaseUrl(): string {
    const raw =
      this.config.get<string>('API_PUBLIC_URL') ??
      process.env.API_PUBLIC_URL ??
      '';
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.length > 0 ? trimmed : 'http://localhost:3000';
  }

  webhookUrl(): string {
    return `${this.publicApiBaseUrl()}/webhooks/github`;
  }

  async getForProject(projectId: string, organizationId: string) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    const row = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: {
        id: true,
        repositoryFullName: true,
        githubPatCiphertext: true,
        lastEventAt: true,
        lastPushAt: true,
        openPullRequestCount: true,
        openIssueCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) {
      return null;
    }
    const { githubPatCiphertext: _pat, ...rest } = row;
    return {
      ...rest,
      hasGithubRestPat: Boolean(_pat),
    };
  }

  async getWithRecentEvents(projectId: string, organizationId: string) {
    const base = await this.getForProject(projectId, organizationId);
    if (!base) {
      return null;
    }
    const recentEvents = await this.prisma.gitHubWebhookEvent.findMany({
      where: { connectionId: base.id },
      select: {
        id: true,
        eventType: true,
        action: true,
        actorLogin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return { ...base, recentEvents };
  }

  async create(
    projectId: string,
    organizationId: string,
    dto: CreateGitHubConnectionDto,
    actorUserId: string,
  ) {
    await this.projectsService.getProjectInOrg(projectId, organizationId);

    const existing = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
    });
    if (existing) {
      throw new ConflictException(
        'This project already has a GitHub connection. Delete it before linking another repository.',
      );
    }

    const repositoryFullName = normalizeRepositoryFullName(dto.repositoryFullName);
    const conflictRepo = await this.prisma.gitHubConnection.findUnique({
      where: { repositoryFullName },
    });
    if (conflictRepo) {
      throw new ConflictException(
        `Repository ${repositoryFullName} is already linked to another project.`,
      );
    }

    const webhookSecret = randomBytes(24).toString('hex');

    const row = await this.prisma.gitHubConnection.create({
      data: {
        projectId,
        repositoryFullName,
        webhookSecret,
      },
      select: {
        id: true,
        repositoryFullName: true,
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'GITHUB_CONNECTED',
      resourceType: 'github_connection',
      resourceId: row.id,
      metadata: { projectId, repositoryFullName },
    });

    return {
      ...row,
      webhookSecret,
      webhookUrl: this.webhookUrl(),
      instructions:
        'In GitHub: Settings → Webhooks → Add webhook. Paste webhook URL, Content type application/json, use the webhook secret.',
    };
  }

  async delete(
    projectId: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const row = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('No GitHub connection for this project');
    }
    await this.prisma.gitHubConnection.delete({ where: { id: row.id } });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'GITHUB_DISCONNECTED',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { connectionId: row.id },
    });
  }

  async setGithubPat(
    projectId: string,
    organizationId: string,
    pat: string,
    actorUserId: string,
  ) {
    if (!isSecretConfigured()) {
      throw new BadRequestException(
        'Set FORETRACE_APP_SECRET (min 16 characters) on the API server before storing a GitHub PAT.',
      );
    }
    const enc = encryptForStorage(pat.trim());
    if (!enc) {
      throw new BadRequestException('Could not encrypt PAT; check server configuration.');
    }
    const conn = await this.prisma.gitHubConnection.findFirst({
      where: { projectId, project: { organizationId } },
      select: { id: true },
    });
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }
    await this.prisma.gitHubConnection.update({
      where: { id: conn.id },
      data: { githubPatCiphertext: enc },
    });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'GITHUB_PAT_SET',
      resourceType: 'github_connection',
      resourceId: conn.id,
      metadata: { projectId },
    });
    return { ok: true as const };
  }

  async clearGithubPat(
    projectId: string,
    organizationId: string,
    actorUserId: string,
  ) {
    const conn = await this.prisma.gitHubConnection.findFirst({
      where: { projectId, project: { organizationId } },
      select: { id: true },
    });
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }
    await this.prisma.gitHubConnection.update({
      where: { id: conn.id },
      data: { githubPatCiphertext: null },
    });
    await this.audit.log({
      organizationId,
      actorUserId,
      action: 'GITHUB_PAT_CLEARED',
      resourceType: 'github_connection',
      resourceId: conn.id,
      metadata: { projectId },
    });
    return { ok: true as const };
  }

  async listUserLinks(
    projectId: string,
    organizationId: string,
    viewerUserId: string,
  ) {
    const conn = await this.getForProject(projectId, organizationId);
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }

    const viewerMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: viewerUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!viewerMembership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }

    const where: Prisma.GitHubUserLinkWhereInput = { connectionId: conn.id };
    if (viewerMembership.role === Role.DEVELOPER) {
      where.userId = viewerUserId;
    }

    return this.prisma.gitHubUserLink.findMany({
      where,
      select: {
        id: true,
        githubLogin: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { githubLogin: 'asc' },
    });
  }

  async addUserLink(
    projectId: string,
    organizationId: string,
    githubLogin: string,
    userId: string,
    actorUserId: string,
  ) {
    const conn = await this.getForProject(projectId, organizationId);
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }

    const actorMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!actorMembership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }
    if (
      actorMembership.role === Role.DEVELOPER &&
      userId !== actorUserId
    ) {
      throw new ForbiddenException(
        'Developers may only link their own GitHub login to their Foretrace account.',
      );
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
    if (!membership) {
      throw new ConflictException(
        'Linked user must be a member of this organization.',
      );
    }

    const normalized = githubLogin.trim().toLowerCase();
    try {
      return await this.prisma.gitHubUserLink.create({
        data: {
          connectionId: conn.id,
          githubLogin: normalized,
          userId,
        },
        select: {
          id: true,
          githubLogin: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'This GitHub login is already linked for this repository.',
        );
      }
      throw e;
    }
  }

  async removeUserLink(
    projectId: string,
    organizationId: string,
    linkId: string,
    actorUserId: string,
  ): Promise<void> {
    const conn = await this.getForProject(projectId, organizationId);
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }

    const link = await this.prisma.gitHubUserLink.findFirst({
      where: { id: linkId, connectionId: conn.id },
    });
    if (!link) {
      throw new NotFoundException('User link not found');
    }

    const actorMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actorUserId,
          organizationId,
        },
      },
      select: { role: true },
    });
    if (!actorMembership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }
    if (
      actorMembership.role === Role.DEVELOPER &&
      link.userId !== actorUserId
    ) {
      throw new ForbiddenException(
        'Developers may only remove their own GitHub login mapping.',
      );
    }

    await this.prisma.gitHubUserLink.delete({ where: { id: link.id } });
  }
}
