import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * No eager `$connect()` so the Nest app can boot without Postgres (frontend/dev UX).
 * The first DB operation opens the connection or surface Prisma errors at use time.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}
