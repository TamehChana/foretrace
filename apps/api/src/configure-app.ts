import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Application } from 'express';
import passport from 'passport';
import session from 'express-session';

function corsOrigins(): string[] {
  const local = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const env = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!env?.length) {
    return local;
  }
  return [...local, ...env];
}

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as Application;
  expressApp.set('trust proxy', 1);

  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const isProd = nodeEnv === 'production';
  let sessionSecret = config.get<string>('SESSION_SECRET')?.trim();
  if (!sessionSecret) {
    sessionSecret = 'foretrace-dev-session-secret-min-32-characters!!';
  }
  if (isProd && sessionSecret.length < 16) {
    throw new Error(
      'SESSION_SECRET must be at least 16 characters when NODE_ENV is production',
    );
  }

  expressApp.use(
    session({
      name: 'foretrace.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // Cross-origin browser clients (e.g. Vercel → Render) need `none` + `secure`.
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  expressApp.use(passport.initialize());
  expressApp.use(passport.session());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
}
