/**
 * Outbox retry backoff schedule for transient MTProto failures.
 *
 * Yangibolim parity: exponential 30 → 90 → 270 seconds. After 3 attempts
 * the row is marked 'failed' (no further auto retry — admin can re-enqueue).
 */
export const RETRY_BACKOFF_SECONDS = [30, 90, 270] as const;
export const MAX_RETRY_ATTEMPTS = RETRY_BACKOFF_SECONDS.length;

/**
 * Compute the next retry instant for a row that has just failed.
 *
 * @param previousRetryCount how many retries the row has already burned (0
 *   for the first failure, 1 after the 30s wait fails, etc).
 * @param now anchor — defaults to wall clock.
 * @returns the absolute Date the worker may pick the row up again, OR
 *   `null` if the row has exhausted retries (caller should mark 'failed').
 */
export function nextRetryAt(previousRetryCount: number, now: Date = new Date()): Date | null {
  if (previousRetryCount < 0) return null;
  if (previousRetryCount >= MAX_RETRY_ATTEMPTS) return null;
  const seconds = RETRY_BACKOFF_SECONDS[previousRetryCount];
  if (seconds === undefined) return null; // belt-and-braces for TS
  return new Date(now.getTime() + seconds * 1000);
}

/** True when the row should transition to 'failed' (no more retries). */
export function isExhausted(previousRetryCount: number): boolean {
  return previousRetryCount >= MAX_RETRY_ATTEMPTS;
}
