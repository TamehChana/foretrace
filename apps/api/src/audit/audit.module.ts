import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService, OrganizationUuidParamGuard],
  exports: [AuditService],
})
export class AuditModule {}
