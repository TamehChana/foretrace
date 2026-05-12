import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './configure-app';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(['error', 'warn', 'log']);
  app.useBodyParser('json', { limit: '600kb' });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
