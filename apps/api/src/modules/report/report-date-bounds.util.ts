/**
 * Report date-range → Asia/Tashkent calendar-day UTC bounds.
 *
 * UZ business reports interpret a date-only range as **Asia/Tashkent calendar
 * days**. Uzbekistan is a FIXED UTC+5 offset (no DST since 1995), so the
 * conversion is a constant ±5h shift — no timezone library needed.
 *
 * The FE sends the range as date-only "YYYY-MM-DD", which `z.coerce.date()`
 * parses to UTC MIDNIGHT (e.g. "2026-06-13" → 2026-06-13T00:00:00.000Z). A naive
 * `moment <= dateTo` then DROPS every document on the last day (its real moment
 * is after 00:00Z), and a local-time `setHours(23,59,59)` "end-of-day" guard
 * silently no-ops under TZ=Asia/Tashkent (UTC-midnight reads back as 05:00 local,
 * so `getHours() === 0` is false). Both bugs were found by the Phase-4 reports QA
 * (_PHASE4-REPORTS-QA-2026-06-13.md).
 *
 * This returns the correct **half-open** UTC window `[gte, lt)` covering the
 * Tashkent calendar days the user picked. Use it as
 * `moment >= gte AND moment < lt` (never `<= dateTo`).
 *
 * Example — from="2026-06-01", to="2026-06-13" (both UTC-midnight):
 *   gte = 2026-05-31T19:00:00.000Z  (= 2026-06-01 00:00 Tashkent)
 *   lt  = 2026-06-13T19:00:00.000Z  (= 2026-06-14 00:00 Tashkent, exclusive)
 *   → covers [Jun 1 00:00, Jun 13 23:59:59.999] Tashkent.
 *
 * `to` defaulting to `new Date()` (now) stays safe: `lt = now + 19h` still
 * includes every past document (nothing is in the future).
 */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function reportDateBounds(from: Date, to: Date): { gte: Date; lt: Date } {
  return {
    // Tashkent 00:00 of `from` = from(UTC-midnight) − 5h.
    gte: new Date(from.getTime() - TASHKENT_OFFSET_MS),
    // exclusive upper = Tashkent 00:00 of (to + 1 day) = to(UTC-midnight) + 24h − 5h.
    lt: new Date(to.getTime() + DAY_MS - TASHKENT_OFFSET_MS),
  };
}

/**
 * Optional date-only range → Asia/Tashkent half-open UTC bounds for a list
 * filter (e.g. `momentFrom`/`momentTo`, `updatedFrom`/`updatedTo`). Either bound
 * may be absent. Replaces the buggy list idiom
 *   { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) }
 * which read a date-only string as UTC midnight (dropping the first 5h of the
 * Tashkent `from` day) and used a UTC end-of-day (leaking 5h of the next day).
 * Use as a Prisma DateTime filter directly: `{ <field>: tashkentRangeBounds(...) }`.
 */
export function tashkentRangeBounds(
  from?: string | null,
  to?: string | null,
): { gte?: Date; lt?: Date } {
  const out: { gte?: Date; lt?: Date } = {};
  if (from) out.gte = new Date(new Date(from).getTime() - TASHKENT_OFFSET_MS);
  if (to) out.lt = new Date(new Date(to).getTime() + DAY_MS - TASHKENT_OFFSET_MS);
  return out;
}
