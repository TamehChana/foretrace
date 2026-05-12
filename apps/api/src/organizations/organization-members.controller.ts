import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BodyDtoPipe } from '../common/pipes/body-dto.pipe';
import { InviteMemberDto } from './dto/invite-member.dto';
import { OrganizationUuidParamGuard } from './organization-uuid-param.guard';
import { MembershipsService } from './memberships.service';

/**
 * Scoped under `organizations/:organizationId` so Nest registers
 * `GET …/members` and `GET …/members/me` as distinct paths (avoids shadowing
 * by `GET organizations/:organizationId` on the main controller).
 */
@Controller('organizations/:organizationId')
export class OrganizationMembersController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get('members/me')
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles()
  async membersMe(
    @Param('organizationId') organizationId: string,
    @Req() req: Request,
  ): Promise<{ data: { role: Role } }> {
    const role = await this.membershipsService.assertMember(
      req.user!.id,
      organizationId,
    );
    return { data: { role } };
  }

  @Get('members')
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles()
  async listMembers(
    @Param('organizationId') organizationId: string,
    @Req() req: Request,
  ): Promise<{
    data: Awaited<
      ReturnType<MembershipsService['listMembersWithUsers']>
    >;
  }> {
    const data = await this.membershipsService.listMembersWithUsers(
      organizationId,
      req.user!.id,
    );
    return { data };
  }

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PM)
  async inviteMember(
    @Param('organizationId') organizationId: string,
    @Body(new BodyDtoPipe(InviteMemberDto)) dto: InviteMemberDto,
    @Req() req: Request,
  ): Promise<{
    data: Awaited<ReturnType<MembershipsService['inviteByEmail']>>;
  }> {
    const data = await this.membershipsService.inviteByEmail(
      organizationId,
      dto,
      req.user!.id,
    );
    return { data };
  }
}
