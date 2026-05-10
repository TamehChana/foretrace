import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  taskCount: number;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(organizationId: string): Promise<ProjectListItem[]> {
    const rows = await this.prisma.project.findMany({
      where: { organizationId, archivedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      taskCount: row._count.tasks,
    }));
  }

  async getProjectInOrg(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async createProject(organizationId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateProject(
    projectId: string,
    organizationId: string,
    dto: UpdateProjectDto,
  ) {
    await this.getProjectInOrg(projectId, organizationId);

    const data: {
      name?: string;
      description?: string | null;
      archivedAt?: Date | null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.archived === true) {
      data.archivedAt = new Date();
    } else if (dto.archived === false) {
      data.archivedAt = null;
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
