import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import {
  extractBearerToken,
  signAccessToken,
  verifyAccessToken,
} from './access-token';
import type { RegisterDto } from './dto/register.dto';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  toPublic(user: Pick<User, 'id' | 'email' | 'displayName'>): Express.User {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? null,
    };
  }

  async register(dto: RegisterDto): Promise<Express.User> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName?.trim() || null,
      },
    });
    return this.toPublic(user);
  }

  async validateCredentials(
    rawEmail: string,
    plainPassword: string,
  ): Promise<Express.User> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(plainPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.toPublic(user);
  }

  /** Session rehydrate — returns null when user deleted or stale id. */
  async findSessionUser(id: string): Promise<Express.User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true },
    });
    return user ? this.toPublic(user) : null;
  }

  private accessTokenSecret(): string {
    return (
      this.config.get<string>('SESSION_SECRET')?.trim() ??
      'foretrace-dev-session-secret-min-32-characters!!'
    );
  }

  /** Signed bearer token for SPAs when session cookies are not sent cross-site. */
  issueAccessToken(userId: string): string {
    return signAccessToken(userId, this.accessTokenSecret());
  }

  /**
   * Passport session (cookie) or `Authorization: Bearer` signed with `SESSION_SECRET`.
   */
  async resolveAuthenticatedUser(req: Request): Promise<Express.User | null> {
    if (req.isAuthenticated?.() === true && req.user) {
      return req.user;
    }
    const raw = extractBearerToken(req.headers.authorization);
    if (!raw) {
      return null;
    }
    const verified = verifyAccessToken(raw, this.accessTokenSecret());
    if (!verified) {
      return null;
    }
    return this.findSessionUser(verified.sub);
  }
}
