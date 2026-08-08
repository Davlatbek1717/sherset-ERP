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

/**
 * AUTH-04: SSE/media allowlist marshrutlarida token `?access_token=` query'da
 * yuradi (EventSource/<img>/window.open header yubora olmaydi) — access-log'dagi
 * `req.url` orqali sizmasligi uchun qiymati redakt qilinadi.
 */
export function scrubAccessTokenFromUrl(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/g, '$1[redacted]');
}

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
      serializers: {
        // wrapSerializers (default true): std-serializer avval ishlaydi,
        // bu yerga tayyor {method,url,…} obyekt keladi.
        req: (req: { url?: unknown } & Record<string, unknown>) => {
          if (typeof req.url === 'string') {
            req.url = scrubAccessTokenFromUrl(req.url);
          }
          return req;
        },
      },
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
        // Security redaction, not a hot path: assigning `undefined` KEEPS the
        // key (Sentry still serialises it, and the header name alone reveals
        // the request was authenticated), so `delete` — which removes the
        // property outright — is the correct operator here, not a perf smell.
        // biome-ignore lint/performance/noDelete: must remove the key, not blank it
        delete event.request.headers.authorization;
        // biome-ignore lint/performance/noDelete: must remove the key, not blank it
        delete event.request.headers.cookie;
      }
      if (event.request?.cookies) event.request.cookies = { _: '[redacted]' };
      return event;
    },
  });
}
