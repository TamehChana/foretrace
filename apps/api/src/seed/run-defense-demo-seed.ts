/**
 * Defense-ready demo seed — idempotent thesis dataset.
 *
 * Run: `npm run seed:defense -w @foretrace/api`
 * Requires: `DATABASE_URL` in `apps/api/.env` (or repo root `.env`).
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { DefenseDemoSeedModule } from './defense-demo-seed.module';
import { DefenseDemoSeedService } from './defense-demo.seed';

async function main(): Promise<void> {
  const log = new Logger('seed:defense');
  const app = await NestFactory.createApplicationContext(DefenseDemoSeedModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const seed = app.get(DefenseDemoSeedService);
    await seed.run();
    log.log('Done. See docs/DEFENSE-DEMO.md for demo accounts and walkthrough.');
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
