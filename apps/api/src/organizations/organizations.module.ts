import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { OrganizationUuidParamGuard } from './organization-uuid-param.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationUuidParamGuard],
})
export class OrganizationsModule {}
