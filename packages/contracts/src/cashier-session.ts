import { z } from 'zod';
import {
  CashDeskRefSchema,
  OrganizationRefSchema,
  StoreRefSchema,
  UserRefSchema,
} from './reference.js';
import { IsoDateTime, MinorAmount, Uuid } from './wire.js';

/** `open → closed`. Mirrors `SessionStateSchema` in `cashier-session.schema.ts`. */
export const SessionStateSchema = z.enum(['open', 'closed']);
export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * `GET /cashier-sessions/current` — the open shift for the calling cashier,
 * or `null` when none is open.
 *
 * **Why this endpoint is the first contract.** Both POS pages hand-declared it
 * and they did not agree (FE-12):
 *
 *   - `retail/page.tsx`  → `cashDesk: CashDesk`        then `session.cashDesk.currency`
 *   - `sotuv/page.tsx`   → `cashDesk: CashDesk | null` then `session.cashDesk?.currency`
 *
 * One endpoint, two contradictory claims, and nothing could tell you which was
 * right. Ground truth: `CashierSession.cashDeskId`, `.storeId` and
 * `.organizationId` are all NON-NULL columns (`schema.prisma`) and
 * `findCurrentForCashier` includes each relation unconditionally — so the
 * relations are **always present** and `retail` was the accurate one. (The
 * audit's own impact note had this backwards; see the Faza 33 report.)
 *
 * This endpoint has already cost us one production crash: `cashier` was the one
 * include `findCurrentForCashier` omitted, so `session.cashier.name` threw
 * `Cannot read properties of undefined` and took the whole POS register down
 * (2026-06-08k). The FE type claimed the field existed; no typechecker could
 * see the gap. `contract-provenance` closes exactly that hole.
 */
export const CurrentSessionSchema = z.object({
  id: Uuid,
  state: SessionStateSchema,
  openedAt: IsoDateTime,
  cashier: UserRefSchema,
  cashDesk: CashDeskRefSchema,
  store: StoreRefSchema,
  organization: OrganizationRefSchema,
  salesCount: z.number().int(),
  /** `BigInt` column → string on the wire. */
  salesSumMinor: MinorAmount,
  /** `BigInt` column → string on the wire. */
  openingCashMinor: MinorAmount,

  // ── P4 (2026-08-12) — «unutilgan smena» himoyasi ────────────────────────
  // Yosh SERVERDA hisoblanadi, ekranda emas: chegara MK13 registrida
  // (`SHIFT_OPEN_WARN_HOURS`) yashaydi va POS uni bilmaydi. Ekran o'zi
  // hisoblasa, chegara ikki joyda ikki xil bo'lardi — bu repo shu bug-klassni
  // allaqachon ko'rgan (narx poli: «ekran + server bitta manbadan»).
  /** Smena ochilganidan beri o'tgan daqiqa (manfiy emas). */
  openMinutes: z.number().int().nonnegative(),
  /** Amaldagi ogohlantirish chegarasi (soat). `null` = chegara o'chirilgan. */
  staleWarnHours: z.number().nullable(),
  /** `openMinutes >= staleWarnHours × 60` — POS ogohlantirish ko'rsatadi. */
  stale: z.boolean(),
});
export type CurrentSession = z.infer<typeof CurrentSessionSchema>;

/** The endpoint returns `null` when the cashier has no open shift. */
export const CurrentSessionResponseSchema = CurrentSessionSchema.nullable();
export type CurrentSessionResponse = z.infer<typeof CurrentSessionResponseSchema>;
