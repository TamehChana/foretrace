import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CliIngestTokenService } from './cli-ingest-token.service';
import { CreateCliTokenDto } from './dto/create-cli-token.dto';

@Controller('organizations/:organizationId/projects/:projectId/cli-tokens')
export class CliTokensController {
  constructor(
    private readonly cliTokens: CliIngestTokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async mint(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() req: Request,
    @Body() dto: CreateCliTokenDto,
  ): Promise<{ data: Awaited<ReturnType<CliIngestTokenService['mintToken']>> }> {
    const userId = req.user!.id;
    const data = await this.cliTokens.mintToken(
      organizationId,
      projectId,
      userId,
      dto.name,
    );
    return { data };
  }

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
  ): Promise<{ data: Awaited<ReturnType<CliIngestTokenService['listForProject']>> }> {
    const data = await this.cliTokens.listForProject(organizationId, projectId);
    return { data };
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async revoke(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('tokenId') tokenId: string,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<CliIngestTokenService['revoke']>> }> {
    const userId = req.user!.id;
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('Organization membership required');
    }
    const role = membership.role;
    const data = await this.cliTokens.revoke(
      userId,
      role,
      organizationId,
      projectId,
      tokenId,
    );
    return { data };
  }
}
