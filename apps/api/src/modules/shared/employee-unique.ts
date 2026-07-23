import { ConflictException } from '@nestjs/common';

/**
 * Maps a Prisma P2002 unique-constraint violation on the `employees` table to a
 * friendly {@link ConflictException} (HTTP 409), discriminating email vs login
 * from `meta.target`.
 *
 * Why this exists: the DB enforces BOTH `@@unique([accountId, email])` (a plain
 * index) and `Employee_account_username_uk` (a PARTIAL index, `WHERE username
 * IS NOT NULL`). The app's pre-checks (`staff.create/update`, `setPassword`) are
 * a TOCTOU window — two concurrent requests can both pass the `findFirst` and
 * then race into the index — and the HR `create/update` paths have NO pre-check
 * at all, so even a *sequential* duplicate goes straight to the index. In every
 * one of those cases Prisma raises P2002, and because only `ZodExceptionFilter`
 * is registered globally (no Prisma exception filter), an unmapped P2002 falls
 * through to a raw HTTP 500. This translates it to the 409 the UI expects.
 *
 * Grounded shape (scripts/probe-employee-p2002-shape.mts, 11u): Prisma reports
 * `code: 'P2002'` with `meta.target = ['account_id','email']` /
 * `['account_id','username']` for the two indexes respectively — yes, the
 * partial username index too, despite its DB name differing from Prisma's
 * generated expectation.
 *
 * Use as a catch-rethrow net, AFTER any optimistic-lock check so a P2025 keeps
 * mapping to {@link import('./optimistic-lock.js').OptimisticLockException}:
 *
 * ```ts
 * } catch (e) {
 *   if (isRecordNotFound(e)) throw new OptimisticLockException('Employee');
 *   throwIfEmployeeUniqueViolation(e); // throws ConflictException on P2002
 *   throw e;                           // anything else is unchanged
 * }
 * ```
 *
 * It is a deliberately PLAIN ConflictException (message only, no
 * `OPTIMISTIC_LOCK` code) so the web client treats it as an ordinary conflict
 * toast, not the "reload the record" optimistic-lock dialog.
 */
export function throwIfEmployeeUniqueViolation(e: unknown): void {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code !== 'P2002') return;
  const target = Array.isArray(err.meta?.target)
    ? err.meta.target.join(',')
    : String(err.meta?.target ?? '');
  if (target.includes('username')) {
    throw new ConflictException('Bu login allaqachon ishlatilgan');
  }
  if (target.includes('email')) {
    throw new ConflictException('Bu email allaqachon ishlatilgan');
  }
  // Owner-reported 2026-07-19: db-push-era databases carry the schema's
  // @@unique([accountId, name]) — a duplicate ФИО surfaced as a bare «Noyob
  // qiymat xatosi» toast with no hint WHICH field clashed. Name it.
  if (target.includes('name')) {
    throw new ConflictException('Bu familiya-ism bilan xodim allaqachon mavjud');
  }
  if (target.includes('phone')) {
    throw new ConflictException('Bu telefon raqami allaqachon ishlatilgan');
  }
  // P2002 on some other Employee unique constraint — still a conflict; embed
  // the clashing columns so the UI (and any bug report) self-diagnoses.
  throw new ConflictException(`Noyob qiymat xatosi (${target || "noma'lum maydon"})`);
}
