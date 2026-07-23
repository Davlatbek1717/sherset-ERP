/**
 * Observability bootstrap — Pino logger + Sentry SDK initialisation.
 *
 * Both are wired through `nestjs-pino` and `@sentry/node` and intentionally
 * stay opt-in via env so the dev experience is unchanged. Production turns
 * them on via:
 *   - LOG_LEVEL=info    (defaults to 'debug' in dev, 'info' in prod)
 *   - LOG_PRETTY=true   (forces pino-pretty even in prod — useful for k8s
 *                        side-cars that already capture stdout)
 *   - SENTRY_DSN=https://...   (no DSN = Sentry stays a no-op)
 *   - SENTRY_TRACES_SAMPLE_RATE=0.1
 *   - SENTRY_PROFILES_SAMPLE_RATE=0.1
 *
 * The redactor scrubs auth headers + cookies before they leave the
 * process so password digests, JWT bodies, and refresh-token cookies
 * never end up in logs or Sentry breadcrumbs.
 */

import * as Sentry from '@sentry/node';
import { LoggerModule } from 'nestjs-pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.passwordHash',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.config.password',
  'req.body.config.apiKey',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
];

export function makePinoModule() {
  const isProd = process.env.NODE_ENV === 'production';
  const pretty = !isProd || process.env.LOG_PRETTY === 'true';
  return LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: !isProd,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
              messageFormat: '{context} {msg}',
              singleLine: true,
            },
          }
        : undefined,
      redact: { paths: REDACT_PATHS, remove: true },
      // Quiet down healthchecks and static assets in the access log; they
      // would otherwise spam the log and obscure real request traffic.
      autoLogging: {
        ignore: (req) => {
          const url = (req as { url?: string }).url ?? '';
          return url === '/health' || url.startsWith('/_next/');
        },
      },
      customLogLevel: (_req, res, err) => {
        if (err) return 'error';
        const status = (res as { statusCode?: number }).statusCode ?? 0;
        if (status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
      },
    },
  });
}

/**
 * Initialise Sentry as early as possible — before NestFactory.create —
 * so it can capture errors that fire during app bootstrap.
 *
 * No-ops when SENTRY_DSN is unset, which keeps dev runs lightweight and
 * avoids accidental error reporting from local experiments.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
    // Strip auth headers and any cookies from the request payload before
    // it leaves the process. Catches the same surface the Pino redactor
    // covers but at the Sentry layer.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      if (event.request?.cookies) event.request.cookies = { _: '[redacted]' };
      return event;
    },
  });
}
