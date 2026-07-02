import { Prisma } from '@moysklad/db';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';

interface FastifyReplyLike {
  status: (code: number) => { send: (body: unknown) => void };
}

/**
 * Shown when a DELETE is blocked because the row is still referenced by other
 * records (the dominant reachable case for this filter). Latin-Uzbek matches
 * the existing service-thrown convention (see `employee-unique.ts`,
 * `store.service.ts`, and the per-entity `currency`/`uom` messages — those two
 * intercept P2003 in-service first and keep their entity-specific wording).
 */
export const IN_USE_MESSAGE = "Yozuv ishlatilmoqda — avval bog'liqliklarni uzing";

/** Shown when a create/update references a row that does not exist. */
export const BAD_REFERENCE_MESSAGE = "Bog'langan yozuv topilmadi yoki noto'g'ri";

/**
 * Shown when a create/update violates a unique constraint (`P2002`). Generic on
 * purpose — the per-entity column name is not leaked, and services that want a
 * field-specific message ("Bu kodli valyuta…", "Bu nomdagi rol…") already throw
 * their own ConflictException in-service before the error escapes to this net.
 */
export const DUPLICATE_VALUE_MESSAGE = 'Bunday qiymatli yozuv allaqachon mavjud';

/**
 * Shown when a mutate-by-id (DELETE/PATCH/PUT) hits `P2025` — the target row no
 * longer exists. Generic, mirroring the bom-service in-service NotFoundException
 * ("Yozuv topilmadi") and the per-entity `findById` pre-checks.
 */
export const NOT_FOUND_MESSAGE = "So'ralgan yozuv topilmadi";

/**
 * Shown when a serializable transaction aborts on a concurrent write conflict or
 * deadlock (`P2034`). This is the LOSING side of a legitimate race: e.g. two
 * parallel demand `post` transitions — the atomic state-claim lets exactly one
 * win and deduct stock once, while the other's `Serializable` tx aborts here
 * instead of double-deducting. A retry observes the new state and either fails
 * cleanly (already posted) or succeeds (transient conflict), so 409 + "retry" is
 * the correct client contract — not a raw 500 server fault.
 */
export const WRITE_CONFLICT_MESSAGE =
  "Yozuv hozir o'zgartirilmoqda — birozdan keyin qayta urinib ko'ring";

/**
 * Global filter: a Prisma foreign-key (`P2003`), required-relation (`P2014`),
 * unique-constraint (`P2002`), or record-not-found (`P2025`) violation is a
 * CLIENT condition, not a server fault. Without this, the unmapped cases
 * surfaced as a raw HTTP 500. This centralises the fix at the HTTP boundary:
 *
 *   - DELETE + P2003/P2014  → 409 Conflict ("in use — disconnect first")
 *   - write  + P2003/P2014  → 400 Bad Request (referenced row does not exist)
 *   - any    + P2002        → 409 Conflict (duplicate value; method-independent —
 *                             a unique violation is a conflict on POST or PATCH)
 *   - DELETE/PATCH/PUT + P2025 → 404 Not Found (the target row is gone)
 *   - POST   + P2025        → 400 Bad Request (a nested `connect` referenced a
 *                             non-existent record — same as P2003-on-create)
 *   - any    + P2034        → 409 Conflict (serializable write-conflict/deadlock;
 *                             the losing side of a concurrent transition — retry)
 *
 * P2003/P2014 closed the ~35 unmapped `delete()` services (store, product-folder,
 * project, …); only `currency`/`uom` mapped it ad-hoc (11y). P2002 closes the
 * remaining unique-violation gap: ~28 services map it per-site, but pre-checkless
 * reference creates (pipeline, price-list, document-state) used to 500 on a
 * duplicate name (11aa). P2025 closes the not-found gap: every direct
 * delete/update pre-checks existence via `findById` (→ a clean 404 already), so
 * the *escaping* P2025 is the TOCTOU race — a concurrent delete removes the row
 * AFTER this request's pre-check passed, the follow-up `delete`/`update` then
 * matches zero rows and Prisma throws P2025, which used to surface as a raw 500
 * for the losing request. Only `bom.service` mapped it ad-hoc (→ 404); every
 * other service rethrew it raw.
 *
 * Crucially, a global filter only transforms the HTTP RESPONSE — it never alters
 * in-process error propagation. So:
 *   - services that already catch P2002/P2003/P2025 in-service (`currency`,
 *     `roles`, `employee-unique`, `bom`, …) keep their specific behaviour — they
 *     throw an HttpException (≠ PrismaClientKnownRequestError) before the error
 *     escapes, so this `@Catch` never sees it;
 *   - the optimistic-lock handlers translate a version-conflict P2025 to
 *     `OptimisticLockException` (409 + `OPTIMISTIC_LOCK` code) IN-SERVICE, again
 *     an HttpException — so this filter never downgrades a lock conflict to 404;
 *     it only maps a genuinely-unhandled P2025 (a delete/update that raced past
 *     an existence pre-check);
 *   - self-healing upsert races that catch P2002 in-process (`analitika/order`
 *     retry, `analitika/count` fallback, atomic document numbering) never let it
 *     escape, so they are unaffected;
 *   - `runBulk` (Promise.allSettled) captures per-item rejections in-process, so
 *     `/bulk-*` is unaffected and still returns its per-id outcome list;
 *   - only a genuinely-unhandled Prisma error reaching the controller boundary is
 *     mapped here.
 *
 * Observability: P2002/P2003/P2014/P2025 are expected client/race conditions and,
 * like the per-site handlers, are NOT forwarded to Sentry (mapping a TOCTOU 404
 * trades a noisy non-bug 500 alert for a quiet, correct response). Any OTHER
 * known-request code (P2000 value-too-long, P2011 null-constraint, …) stays a 500
 * and IS forwarded to Sentry + the log, so a real server fault is never silently
 * swallowed.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReplyLike>();

    // A unique violation is a conflict regardless of verb — map it before the
    // method-aware branches so P2002 never depends on the method.
    if (exception.code === 'P2002') {
      reply.status(HttpStatus.CONFLICT).send({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: DUPLICATE_VALUE_MESSAGE,
      });
      return;
    }

    const method = (http.getRequest<{ method?: string }>().method ?? 'GET').toUpperCase();

    if (exception.code === 'P2003' || exception.code === 'P2014') {
      if (method === 'DELETE') {
        reply.status(HttpStatus.CONFLICT).send({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: IN_USE_MESSAGE,
        });
      } else {
        reply.status(HttpStatus.BAD_REQUEST).send({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: BAD_REFERENCE_MESSAGE,
        });
      }
      return;
    }

    if (exception.code === 'P2025') {
      // POST → the create's nested `connect` referenced a missing record: a bad
      // reference (400), mirroring P2003-on-create. Any mutate-by-id verb → the
      // target row is gone (404).
      if (method === 'POST') {
        reply.status(HttpStatus.BAD_REQUEST).send({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: BAD_REFERENCE_MESSAGE,
        });
      } else {
        reply.status(HttpStatus.NOT_FOUND).send({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: NOT_FOUND_MESSAGE,
        });
      }
      return;
    }

    if (exception.code === 'P2034') {
      // Write conflict / deadlock in a serializable tx — a transient race, not a
      // server fault. Expected (the losing side of a concurrent transition), so
      // NOT forwarded to Sentry; the client should retry.
      reply.status(HttpStatus.CONFLICT).send({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: WRITE_CONFLICT_MESSAGE,
      });
      return;
    }

    // Any other known-request error keeps today's behaviour (500) but through a
    // consistent envelope, and is forwarded to Sentry + the log so this filter
    // never silently swallows a server fault.
    this.logger.error(`Unmapped Prisma error ${exception.code}: ${exception.message}`);
    Sentry.captureException(exception);
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  }
}
