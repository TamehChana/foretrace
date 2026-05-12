import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { PrismaService } from '../prisma/prisma.service';
import type { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRole(userId: string, organizationId: string): Promise<Role | null> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async assertMember(userId: string, organizationId: string): Promise<Role> {
    const role = await this.getRole(userId, organizationId);
    if (!role) {
      throw new NotFoundException('You are not a member of this organization');
    }
    return role;
  }

  /** Org members with user id and email — for task assignee pickers (caller must be a member). */
  async listMembersWithUsers(
    organizationId: string,
    actorUserId: string,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      displayName: string | null;
      role: Role;
    }>
  > {
    await this.assertMember(actorUserId, organizationId);
    const rows = await this.prisma.membership.findMany({
      where: { organizationId },
      select: {
        role: true,
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { user: { email: 'asc' } },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      email: r.user.email,
      displayName: r.user.displayName,
      role: r.role,
    }));
  }

  /** Invite/add an existing registered user (`passwordHash` presence optional for future SSO). Requires target user row. */
  async inviteByEmail(
    organizationId: string,
    dto: InviteMemberDto,
    actorUserId: string,
  ): Promise<{ userId: string; role: Role }> {
    const actorRole = await this.assertMember(actorUserId, organizationId);
    if (actorRole !== Role.ADMIN && actorRole !== Role.PM) {
      throw new BadRequestException(
        'Only organization administrators and PMs can add members.',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'No user with that email. They must register first.',
      );
    }

    try {
      const membership = await this.prisma.membership.create({
        data: {
          userId: user.id,
          organizationId,
          role: dto.role,
        },
        select: { userId: true, role: true },
      });
      return { userId: membership.userId, role: membership.role };
    } catch (error: unknown) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This user is already a member of this organization.',
        );
      }
      throw error;
    }
  }
}
