import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { ProductionExceptionFilter } from './common/filters/production-exception.filter';

// Load backend/.env before Nest reads process.env. In non-production, override shell
// variables (e.g. a stray PORT) so .env remains authoritative for local dev.
loadEnv({
  path: join(process.cwd(), '.env'),
  override: process.env.NODE_ENV === 'production' ? false : true,
});

function assertProductionCorsConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    throw new Error(
      'CORS_ORIGIN must be set in production (comma-separated HTTPS origins). Example: https://nezhin.cc',
    );
  }
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of origins) {
    if (!o.startsWith('https://')) {
      throw new Error(
        `CORS_ORIGIN must use https:// in production (rejecting: ${o}).`,
      );
    }
    if (/localhost|127\.0\.0\.1/i.test(o)) {
      throw new Error(
        'CORS_ORIGIN must not include localhost or 127.0.0.1 in production.',
      );
    }
  }
}

async function bootstrap() {
  assertProductionCorsConfig();

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  const trustProxy =
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_PROXY === 'true' ||
    process.env.NODE_ENV === 'production';
  if (trustProxy) {
    expressApp.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalFilters(new ProductionExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`SERVER RUNNING ON PORT ${port}`);
}
bootstrap();
