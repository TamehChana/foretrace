import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { AlertsService } from './alerts.service';

@Controller('organizations/:organizationId/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @UseGuards(
    OrganizationUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async list(
    @Param('organizationId') organizationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('unread') unreadRaw?: string,
  ): Promise<{
    data: Awaited<ReturnType<AlertsService['listForOrganization']>>;
  }> {
    const unreadOnly =
      unreadRaw === '1' || unreadRaw === 'true' || unreadRaw === 'yes';
    const data = await this.alerts.listForOrganization(organizationId, {
      limit,
      unreadOnly,
    });
    return { data };
  }

  @Post(':alertId/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    OrganizationUuidParamGuard,
    AuthenticatedGuard,
    RolesGuard,
  )
  @Roles()
  async markRead(
    @Param('organizationId') organizationId: string,
    @Param('alertId') alertId: string,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<AlertsService['markRead']>> }> {
    const data = await this.alerts.markRead(
      organizationId,
      alertId,
      req.user!.id,
    );
    return { data };
  }
}
