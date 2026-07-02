import { BadRequestException, ConflictException } from '@nestjs/common';
import { BAD_REFERENCE_MESSAGE } from './prisma-exception.filter.js';

/**
 * Optimistic concurrency control for field-edit saves (moysklad parity).
 *
 * The problem (a real, silent data-integrity defect): two users open the same
 * record's edit form, both load version N, user A saves (last-write-wins, the
 * row is now version-bumped), then user B saves on top — B's stale copy
 * overwrites A's changes with no warning. A's edit is *lost*. On money-adjacent
 * master data (prices, VAT, MXIK, tracking) that is unacceptable.
 *
 * The fix: every versioned entity carries an integer `version` column. The
 * edit form sends back the `version` it loaded; the repository runs the update
 * as `WHERE id = ? AND version = ?  SET ..., version = version + 1`. If the row
 * was changed since the form loaded, the version no longer matches, zero rows
 * update, and Prisma throws P2025 — which we translate to HTTP 409 so the client
 * can prompt the user to reload the latest copy instead of clobbering it.
 *
 * Why integer `version` and not the existing `updatedAt` timestamp: Postgres
 * `timestamptz` stores microseconds, but a JSON round-trip truncates to
 * milliseconds, so `WHERE updatedAt = <client value>` would essentially never
 * match and *every* save would 409. An integer compares exactly and is the
 * value moysklad itself versions on. (The schema already carried a
 * `version Int @default(1)` on Region with this exact intent.)
 *
 * The body carries a machine-readable `code` so the web client can tell an
 * optimistic-lock conflict apart from any other 409 (e.g. a unique-constraint
 * clash) and show the reload dialog only for the former. The `message` is an
 * English fallback — the web app renders its own localized copy off `code`.
 */
export const OPTIMISTIC_LOCK_CODE = 'OPTIMISTIC_LOCK';

export class OptimisticLockException extends ConflictException {
  constructor(entity = 'Record') {
    super({
      statusCode: 409,
      code: OPTIMISTIC_LOCK_CODE,
      message: `${entity} was modified by another user. Reload and try again.`,
    });
  }
}

/**
 * True when a thrown error is Prisma's "record to update/delete not found"
 * (P2025). On a version-guarded update whose existence was already confirmed
 * (a `findById` immediately before), a P2025 means the version filter did not
 * match — i.e. a concurrent write bumped the version — so the caller maps it to
 * {@link OptimisticLockException}.
 */
export function isRecordNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2025';
}

/**
 * True when a P2025 was caused by a failed nested `connect` (a missing foreign
 * reference), NOT by a missing main record.
 *
 * P2025 is overloaded on a version-guarded update that also performs nested
 * `connect`s: the `where: { id, version }` guard and a bad nested `connect`
 * (e.g. `group: { connect: { id } }` with a non-existent id) BOTH throw P2025,
 * and {@link isRecordNotFound} cannot tell them apart. Prisma's `meta.cause`
 * can — grounded against PostgreSQL (probe, 2026-06-12):
 *
 *   - bad nested connect → "No 'Group' record(s) (needed to inline the relation
 *     on 'Counterparty' record(s)) was found for a **nested connect** on
 *     one-to-many relation 'CounterpartyToGroup'."
 *   - version-guard miss / concurrent delete → "Record to update not found."
 *
 * Returns true ONLY for a positively-identified nested-connect failure, so an
 * unrecognised future Prisma wording degrades safely to the optimistic-lock
 * path (today's behaviour) rather than mislabelling a real lock conflict.
 * `prisma-not-found-classification.test.ts` locks the grounded `cause` strings
 * so a Prisma upgrade that changes the wording fails loudly.
 */
export function isNestedConnectNotFound(e: unknown): boolean {
  if (!isRecordNotFound(e)) return false;
  const cause = (e as { meta?: { cause?: unknown } }).meta?.cause;
  return typeof cause === 'string' && cause.includes('nested connect');
}

/**
 * Map an error caught from a version-guarded `update` (a `where: { id, version }`
 * guard, possibly with nested `connect`s) to the correct HTTP error, then RETURN
 * so the caller still falls through to its own `handlePrisma` for non-P2025
 * errors (P2002 unique, etc.):
 *
 *   - bad nested connect (a missing foreign reference) → **400** BadRequest with
 *     {@link BAD_REFERENCE_MESSAGE} — the SAME message the global
 *     `PrismaExceptionFilter` raises for the create-path P2025/P2003 equivalent,
 *     so a bad reference reads consistently whichever verb hit it;
 *   - any other P2025 (the version guard matched zero rows — a concurrent write
 *     bumped the version, or a concurrent delete removed the row) → **409**
 *     {@link OptimisticLockException} (the loaded form is stale → reload);
 *   - non-P2025 → returns void; the caller's `handlePrisma(e)` maps it.
 *
 * Replaces the former `if (isRecordNotFound(e)) throw new OptimisticLockException(entity)`
 * one-liner at every locked-update call-site. Before, PATCHing with an invalid
 * `groupId`/`priceTypeId`/`stateId`/… returned "modified by another user, reload"
 * (409) — telling the user to reload when the real problem was a bad reference
 * (audit §3 of the 11ab Prisma-not-found filter).
 *
 * Precedence (grounded by live smoke): Prisma validates a nested `connect` target
 * INDEPENDENTLY of the version-filtered write, so a bad reference raises the
 * connect-P2025 even when the version is ALSO stale → such a request gets 400, not
 * 409. That is intended: a missing reference is a bad reference regardless of
 * staleness. A *valid* connect with a stale version still yields the version-miss
 * P2025 → 409.
 */
export function mapVersionedUpdateError(e: unknown, entity = 'Record'): void {
  if (isNestedConnectNotFound(e)) {
    throw new BadRequestException(BAD_REFERENCE_MESSAGE);
  }
  if (isRecordNotFound(e)) {
    throw new OptimisticLockException(entity);
  }
}
