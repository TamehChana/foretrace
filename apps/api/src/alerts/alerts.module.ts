import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationUuidParamGuard } from '../organizations/organization-uuid-param.guard';

import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule, AuditModule, EmailModule],
  controllers: [AlertsController],
  providers: [AlertsService, OrganizationUuidParamGuard],
  exports: [AlertsService],
})
export class AlertsModule {}
