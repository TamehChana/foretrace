import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectUuidParamGuard } from '../common/project-uuid-param.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { CreateGitHubConnectionDto } from './dto/create-github-connection.dto';
import { CreateGitHubUserLinkDto } from './dto/create-github-user-link.dto';
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
  ) {
    const data = await this.githubConnectionService.create(
      projectId,
      organizationId,
      dto,
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
  ): Promise<void> {
    await this.githubConnectionService.delete(projectId, organizationId);
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
  ) {
    const data = await this.githubConnectionService.listUserLinks(
      projectId,
      organizationId,
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
  @Roles(Role.ADMIN, Role.PM)
  async createUserLink(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateGitHubUserLinkDto,
  ) {
    const data = await this.githubConnectionService.addUserLink(
      projectId,
      organizationId,
      dto.githubLogin,
      dto.userId,
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
  @Roles(Role.ADMIN, Role.PM)
  async deleteUserLink(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('linkId', new ParseUUIDPipe({ version: '4' })) linkId: string,
  ): Promise<void> {
    await this.githubConnectionService.removeUserLink(
      projectId,
      organizationId,
      linkId,
    );
  }
}
