import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationUuidParamGuard } from './organization-uuid-param.guard';
import { MembershipsService } from './memberships.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationMembersController, OrganizationsController],
  providers: [
    OrganizationsService,
    MembershipsService,
    OrganizationUuidParamGuard,
  ],
})
export class OrganizationsModule {}
