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

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationUuidParamGuard } from './organization-uuid-param.guard';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @UseGuards(AuthenticatedGuard)
  async list(@Req() req: Request): Promise<{
    data: Awaited<ReturnType<OrganizationsService['listForUser']>>;
  }> {
    const userId = req.user!.id;
    const data = await this.organizationsService.listForUser(userId);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedGuard)
  async create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: Request,
  ): Promise<{
    data: Awaited<ReturnType<OrganizationsService['createForUser']>>;
  }> {
    const data = await this.organizationsService.createForUser(
      req.user!.id,
      dto,
    );
    return { data };
  }

  /**
   * Declared before `GET :organizationId` so Nest does not interpret `delivery-policy` as a UUID.
   *
   * PM-or-Admin only example (SRS): org-scoped route with `@Roles(...)`.
   */
  @Get(':organizationId/delivery-policy')
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PM)
  deliveryPolicyPlaceholder(@Param('organizationId') organizationId: string): {
    organizationId: string;
    message: string;
  } {
    return {
      organizationId,
      message:
        'Alert and delivery policy APIs will live here; this route verifies ADMIN/PM membership.',
    };
  }

  /** Any org member; `RolesGuard` reads `organizationId` from this path segment. */
  @Get(':organizationId')
  @UseGuards(OrganizationUuidParamGuard, AuthenticatedGuard, RolesGuard)
  @Roles()
  async getOne(
    @Param('organizationId') organizationId: string,
  ): Promise<{ data: Awaited<ReturnType<OrganizationsService['getById']>> }> {
    const data = await this.organizationsService.getById(organizationId);
    return { data };
  }
}
