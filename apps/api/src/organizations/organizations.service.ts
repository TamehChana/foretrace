import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';

export type OrgListItem = {
  id: string;
  name: string;
  slug: string | null;
};

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<OrgListItem[]> {
    return this.prisma.organization.findMany({
      where: {
        memberships: {
          some: { userId },
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(organizationId: string): Promise<OrgListItem> {
    const row = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!row) {
      throw new NotFoundException('Organization not found');
    }
    return row;
  }

  /**
   * Creates an organization and makes the requesting user **`ADMIN`** (bootstrap path before invites exist).
   */
  async createForUser(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<OrgListItem> {
    const slug = dto.slug ?? null;

    if (slug) {
      const taken = await this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That slug is already taken.');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: dto.name,
            slug,
          },
          select: { id: true, name: true, slug: true },
        });
        await tx.membership.create({
          data: {
            userId,
            organizationId: org.id,
            role: Role.ADMIN,
          },
        });
        return org;
      });
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Could not create organization (unique constraint).',
        );
      }
      throw error;
    }
  }
}
