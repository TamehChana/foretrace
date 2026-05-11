import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedGuard } from './guards/authenticated.guard';

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@Req() req: Request): { user: Express.User | null } {
    if (req.isAuthenticated?.() !== true || !req.user) {
      return { user: null };
    }
    return { user: req.user };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 15, ttl: 600000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<{ user: Express.User }> {
    const user = await this.authService.register(dto);
    await new Promise<void>((resolve, reject) => {
      req.logIn(user, (err: unknown) => {
        if (err) {
          reject(asError(err));
          return;
        }
        resolve();
      });
    });
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 25, ttl: 600000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{ user: Express.User }> {
    const user = await this.authService.validateCredentials(
      dto.email,
      dto.password,
    );
    await new Promise<void>((resolve, reject) => {
      req.logIn(user, (err: unknown) => {
        if (err) {
          reject(asError(err));
          return;
        }
        resolve();
      });
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedGuard)
  async logout(@Req() req: Request): Promise<{ ok: true }> {
    await new Promise<void>((resolve, reject) => {
      req.logout((err: unknown) => {
        if (err) {
          reject(asError(err));
          return;
        }
        resolve();
      });
    });
    return { ok: true };
  }
}
