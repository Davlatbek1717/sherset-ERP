import type { Prisma } from '@moysklad/db';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { PrismaService } from '../../../prisma/prisma.service.js';

/**
 * HR activity log (spec §6.16 / §8 — "har CRUD yoziladi"). A self-scoping
 * global interceptor: on every SUCCESSFUL mutating request under `/hr/*` it
 * writes one HrActivityLog row (who / what action / which entity). Non-HR and
 * non-mutating requests pass straight through (zero impact), so it can be
 * registered app-wide via APP_INTERCEPTOR without touching every controller.
 *
 * Safety:
 *   • Non-fatal — a logging failure never breaks the request (try/catch).
 *   • Secret-redacting — the request body is stored as `diff` with sensitive
 *     keys (apiHash, password, code, token, secret, otp) replaced by
 *     "[redacted]" so the audit trail can never leak Telegram credentials /
 *     OTP / 2FA passwords.
 */
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HR_ROUTE = /\/hr\/([^/?]+)/;
const SENSITIVE = /(hash|password|secret|token|code|otp|api_?key)/i;

@Injectable()
export class HrActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HrActivityInterceptor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req?.method ?? '';
    const url: string = req?.originalUrl ?? req?.url ?? '';
    if (!MUTATIONS.has(method) || !HR_ROUTE.test(url)) return next.handle();
    return next.handle().pipe(tap((body) => this.record(req, method, url, body)));
  }

  private record(
    req: { user?: { sub?: string; accountId?: string }; body?: unknown; params?: { id?: string } },
    method: string,
    url: string,
    responseBody: unknown,
  ): void {
    // Fire-and-forget; never block or break the response.
    void (async () => {
      try {
        const user = req.user;
        if (!user?.accountId) return;
        const action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
        const entityId = pickId(responseBody) ?? req.params?.id ?? null;
        const diff = method === 'DELETE' ? undefined : redact(req.body);
        await this.prisma.client.hrActivityLog.create({
          data: {
            accountId: user.accountId,
            actorId: user.sub ?? null,
            action,
            entityType: entityType(url),
            entityId,
            ...(diff ? { diff: diff as Prisma.InputJsonValue } : {}),
          },
        });
      } catch (e) {
        this.logger.warn(`HR activity log skipped: ${(e as Error).message}`);
      }
    })();
  }
}

/** `/api/v1/hr/task-templates/:id` → `hr_task_templates` (≤50 chars). */
export function entityType(url: string): string {
  const seg = HR_ROUTE.exec(url)?.[1] ?? 'hr';
  return `hr_${seg.replace(/-/g, '_')}`.slice(0, 50);
}

function pickId(body: unknown): string | null {
  if (body && typeof body === 'object' && 'id' in body) {
    const id = (body as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

/** Shallow copy with sensitive keys redacted. Returns undefined for non-objects. */
export function redact(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  }
  return out;
}
