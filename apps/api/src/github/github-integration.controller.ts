import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { CreateGitHubConnectionDto } from './dto/create-github-connection.dto';
import { CreateGitHubUserLinkDto } from './dto/create-github-user-link.dto';
import { SetGithubPatDto } from './dto/set-github-pat.dto';
import { GithubConnectionService } from './github-connection.service';

@Controller('organizations/:organizationId/projects/:projectId/github')
export class GithubIntegrationController {
  constructor(private readonly githubConnectionService: GithubConnectionService) {}

  @Get()
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async summary(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.githubConnectionService.getWithRecentEvents(
      projectId,
      organizationId,
    );
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async connect(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateGitHubConnectionDto,
    @Req() req: Request,
  ) {
    const data = await this.githubConnectionService.create(
      projectId,
      organizationId,
      dto,
      req.user!.id,
    );
    return { data };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async disconnect(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.githubConnectionService.delete(
      projectId,
      organizationId,
      req.user!.id,
    );
  }

  @Patch('pat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async setPat(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: SetGithubPatDto,
    @Req() req: Request,
  ) {
    const data = await this.githubConnectionService.setGithubPat(
      projectId,
      organizationId,
      dto.pat,
      req.user!.id,
    );
    return { data };
  }

  @Delete('pat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM)
  async clearPat(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ) {
    const data = await this.githubConnectionService.clearGithubPat(
      projectId,
      organizationId,
      req.user!.id,
    );
    return { data };
  }

  @Get('user-links')
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async listUserLinks(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ) {
    const data = await this.githubConnectionService.listUserLinks(
      projectId,
      organizationId,
      req.user!.id,
    );
    return { data };
  }

  @Post('user-links')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async createUserLink(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateGitHubUserLinkDto,
    @Req() req: Request,
  ) {
    const data = await this.githubConnectionService.addUserLink(
      projectId,
      organizationId,
      dto.githubLogin,
      dto.userId,
      req.user!.id,
    );
    return { data };
  }

  @Delete('user-links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    OrganizationUuidParamGuard,
    ProjectUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles(Role.ADMIN, Role.PM, Role.DEVELOPER)
  async deleteUserLink(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('linkId', new ParseUUIDPipe({ version: '4' })) linkId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.githubConnectionService.removeUserLink(
      projectId,
      organizationId,
      linkId,
      req.user!.id,
    );
  }
}
