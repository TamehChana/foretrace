import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { RolesGuard } from './guards/roles.guard';
import { SessionSerializer } from './session.serializer';

@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, SessionSerializer, AuthenticatedGuard, RolesGuard],
  exports: [AuthService, AuthenticatedGuard, RolesGuard],
})
export class AuthModule {}
