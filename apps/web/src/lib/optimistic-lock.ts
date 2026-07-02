/**
 * Front-end side of the optimistic-lock contract (see the API's
 * `modules/shared/optimistic-lock.ts`).
 *
 * When a field-edit save loses a concurrency race the backend replies 409 with
 * a body `{ code: 'OPTIMISTIC_LOCK', message }`. This helper recognises that
 * specific 409 so callers can show the "record changed — reload?" dialog only
 * for a real conflict, and fall through to the normal error toast for any other
 * 409 (e.g. a unique-constraint clash). The error object is produced by
 * `api-client.ts`, which attaches `.status` (HTTP code) and `.body` (parsed
 * JSON) to the thrown Error.
 */

export const OPTIMISTIC_LOCK_CODE = 'OPTIMISTIC_LOCK';

export function isOptimisticConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: number; body?: { code?: unknown } };
  return e.status === 409 && e.body?.code === OPTIMISTIC_LOCK_CODE;
}
