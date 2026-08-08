import 'reflect-metadata';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { resolveSecret } from './modules/auth/boot-secrets.js';
import { PrismaExceptionFilter } from './modules/shared/prisma-exception.filter.js';
import { StripTenantInterceptor } from './modules/shared/strip-tenant.interceptor.js';
import { ZodExceptionFilter } from './modules/shared/zod-exception.filter.js';
import { initSentry } from './observability.js';

// BigInt → string serialization for JSON responses (Prisma returns bigint
// for Money fields stored in minor units = tiyin).
(BigInt.prototype as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  // Sentry first so errors during NestFactory.create get captured.
  initSentry();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // bodyLimit 8 MB (Fastify default is 1 MB): product-image uploads send the
    // photo as base64 JSON, and a 4 MB raw image (the FE limit) inflates to
    // ≈5.34 MB encoded — the 1 MB default 413'd every real photo. The per-field
    // Zod cap (dataBase64 ≤ 6 MB) remains the real image backstop.
    new FastifyAdapter({ logger: false, bodyLimit: 8 * 1024 * 1024 }),
    // Hide the bootstrap noise; nestjs-pino takes over once the module loads.
    { bufferLogs: true },
  );

  // Swap the default Nest logger for the Pino-backed one. Every controller,
  // service, and lifecycle log now flows through Pino with the redactor we
  // configured in observability.ts.
  app.useLogger(app.get(Logger));

  await app.register(helmet);
  await app.register(cookie, {
    // AUTH-02: prod'da sir majburiy — jim dev-fallback = auth-bypass.
    secret: resolveSecret({
      name: 'COOKIE_SECRET',
      value: process.env.COOKIE_SECRET,
      devFallback: 'dev-cookie-secret-change-in-prod',
      nodeEnv: process.env.NODE_ENV,
    }),
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow any localhost port in dev
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
        cb(null, true);
        return;
      }
      const allowed = process.env.WEB_ORIGIN?.split(',') ?? [];
      cb(null, allowed.includes(origin));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // Enable raw `ws` adapter for HR realtime gateways (/ws/hr/tasks).
  // The path inside @WebSocketGateway already includes the /api/v1 prefix.
  app.useWebSocketAdapter(new WsAdapter(app));

  // Global response interceptor — strips `accountId` from every JSON
  // response so the tenant pivot stays server-side. Moysklad parity:
  // their API doesn't surface account_id either.
  app.useGlobalInterceptors(new StripTenantInterceptor());

  // Zod `.parse()` failures are invalid user input → 400, not 500.
  // Prisma FK / required-relation violations (P2003/P2014) are client conditions
  // → 409 on DELETE (row in use) / 400 on write (bad reference), not 500. The two
  // filters have disjoint @Catch targets so registration order is irrelevant.
  app.useGlobalFilters(new ZodExceptionFilter(), new PrismaExceptionFilter());

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  NestLogger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
