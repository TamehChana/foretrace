import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Application } from 'express';
import passport from 'passport';
import session from 'express-session';

/**
 * Allowed browser origins besides localhost (from `CORS_ORIGINS`). Every Vercel
 * deployment preview has a unique `*.vercel.app` URL; list each production URL,
 * **or** set `CORS_ALLOW_VERCEL_PREVIEW=1` during development-style preview testing.
 */
function corsExplicitAllowlist(): Set<string> {
  const local = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const fromEnv =
    process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ??
    [];
  return new Set([...local, ...fromEnv]);
}

function isTruthyEnv(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function allowsVercelPreviewHost(config: ConfigService): boolean {
  return (
    isTruthyEnv(config.get<string>('CORS_ALLOW_VERCEL_PREVIEW')) ||
    isTruthyEnv(process.env.CORS_ALLOW_VERCEL_PREVIEW)
  );
}

function isHttpsVercelPreviewOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function corsOriginVerifier(config: ConfigService) {
  const allowlist = corsExplicitAllowlist();
  const vercelPreviews = allowsVercelPreviewHost(config);

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void => {
    if (
      typeof origin !== 'string' ||
      origin.length === 0 ||
      origin === 'null'
    ) {
      callback(null, true);
      return;
    }
    if (allowlist.has(origin)) {
      callback(null, true);
      return;
    }
    if (vercelPreviews && isHttpsVercelPreviewOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
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
    origin: corsOriginVerifier(config),
    credentials: true,
  });
}
