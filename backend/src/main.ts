import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
const cookieParser = require('cookie-parser');
import type { Express } from 'express';
import { AppModule } from './app.module';

// Load backend/.env before Nest reads process.env. In non-production, override shell
// variables (e.g. a stray PORT) so .env remains authoritative for local dev.
loadEnv({
  path: join(process.cwd(), '.env'),
  override: process.env.NODE_ENV === 'production' ? false : true,
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    expressApp.set('trust proxy', 1);
  }
  app.use(cookieParser());
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });
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
