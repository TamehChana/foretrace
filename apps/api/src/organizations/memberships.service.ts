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

  /** Invite/add an existing registered user (`passwordHash` presence optional for future SSO). Requires target user row. */
  async inviteByEmail(
    organizationId: string,
    dto: InviteMemberDto,
    actorUserId: string,
  ): Promise<{ userId: string; role: Role }> {
    const actorRole = await this.assertMember(actorUserId, organizationId);
    if (actorRole !== Role.ADMIN) {
      throw new BadRequestException(
        'Only organization administrators can add members.',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(
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
