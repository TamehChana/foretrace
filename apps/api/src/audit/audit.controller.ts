import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';
import { AuditService } from './audit.service';

@Controller('organizations/:organizationId/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

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
  ): Promise<{
    data: Awaited<ReturnType<AuditService['listForOrganization']>>;
  }> {
    const data = await this.audit.listForOrganization(organizationId, limit);
    return { data };
  }
}
