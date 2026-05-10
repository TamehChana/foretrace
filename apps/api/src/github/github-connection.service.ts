import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

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
        lastEventAt: true,
        lastPushAt: true,
        openPullRequestCount: true,
        openIssueCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return row;
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

  async create(projectId: string, organizationId: string, dto: CreateGitHubConnectionDto) {
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

    return {
      ...row,
      webhookSecret,
      webhookUrl: this.webhookUrl(),
      instructions:
        'In GitHub: Settings → Webhooks → Add webhook. Paste webhook URL, Content type application/json, use the webhook secret.',
    };
  }

  async delete(projectId: string, organizationId: string): Promise<void> {
    await this.projectsService.getProjectInOrg(projectId, organizationId);
    const row = await this.prisma.gitHubConnection.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('No GitHub connection for this project');
    }
    await this.prisma.gitHubConnection.delete({ where: { id: row.id } });
  }

  async listUserLinks(projectId: string, organizationId: string) {
    const conn = await this.getForProject(projectId, organizationId);
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
    }
    return this.prisma.gitHubUserLink.findMany({
      where: { connectionId: conn.id },
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
  ) {
    const conn = await this.getForProject(projectId, organizationId);
    if (!conn) {
      throw new NotFoundException('No GitHub connection for this project');
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

    await this.prisma.gitHubUserLink.delete({ where: { id: link.id } });
  }
}
