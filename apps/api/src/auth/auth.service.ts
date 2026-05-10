import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
