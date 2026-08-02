import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * RetailSale — POS receipt document.
 *
 * FSM: draft ──send-to-picking──► picking ──mark-ready──► ready ──post──► posted
 *        └──────────────────────── post ────────────────────────────────────┘
 *      har bosqichdan → cancelled (draft/picking/ready)
 *      (refund creates a new RetailSale in posted state immediately)
 *
 * `picking` / `ready` — omborchi zanjiri (2026-08-01 `d7ab3b1`):
 * `send-to-picking` omborlarga yig'ish varaqalarini yuboradi va hujjatni
 * `picking` ga o'tkazadi; har omborchi `mark-ready` bilan O'Z zonasi
 * topshiriqlarini yopadi, barcha zonalar tugagach hujjat `ready` bo'ladi.
 * Ular DB'ga (VarChar) yozilardi-yu, shu enum'da yo'q edi — natijada POS'ning
 * `?state=picking` / `?state=ready` ro'yxat so'rovlari 400 qaytarardi va
 * «Yig'ilmoqda» / «Tayyor» ro'yxatlari bo'sh qolardi (TZ 1-bo'lim §0.1).
 *
 * Invariants:
 *   - post requires session.state='open'
 *   - post: cashAmount + cardAmount >= sumMinor (change computed from overpayment)
 *   - cancel only from a pre-posted state (draft/picking/ready)
 *   - One open session per cashier enforced in CashierSessionService
 */

export const RetailSaleStateSchema = z.enum([
  'draft',
  'picking',
  'ready',
  'posted',
  'refunded',
  'cancelled',
]);
export type RetailSaleState = z.infer<typeof RetailSaleStateSchema>;

// --- Position ---

export const RetailSalePositionInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.default('0'),
});
export type RetailSalePositionInput = z.infer<typeof RetailSalePositionInputSchema>;

// --- Create draft ---

export const CreateRetailSaleSchema = z.object({
  sessionId: z.string().uuid(),
  agentId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  description: z.string().max(4000).nullish(),
  // moysklad «Внешний код» — universal external-system sync key (the
  // RetailSale model already carries the column; this exposes it on the
  // create/update API used by POS/e-commerce integrations).
  externalCode: z.string().max(50).nullish(),
  positions: z.array(RetailSalePositionInputSchema).min(1, 'at least one position required'),
});
export type CreateRetailSaleInput = z.infer<typeof CreateRetailSaleSchema>;

// --- Update draft (patch positions) ---

export const UpdateRetailSaleSchema = z.object({
  agentId: z.string().uuid().nullish(),
  description: z.string().max(4000).nullish(),
  externalCode: z.string().max(50).nullish(),
  positions: z.array(RetailSalePositionInputSchema).min(1).optional(),
  // Optimistic-lock token (moysklad parity). REQUIRED on update (absent on
  // create): the edit/integration client echoes back the `version` it loaded
  // and the service runs the header write as WHERE version = ? … version += 1,
  // so a stale copy 409s instead of silently clobbering a concurrent edit.
  version: z.number().int().nonnegative(),
});
export type UpdateRetailSaleInput = z.infer<typeof UpdateRetailSaleSchema>;

// --- Post (take payment) ---

export const PostRetailSaleSchema = z.object({
  cashAmountMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'cashAmountMinor must be a non-negative integer'),
  cardAmountMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'cardAmountMinor must be a non-negative integer'),
  // Kassa TZ §6 — aralash to'lov. Bu ikkitasi `/sotuv` to'lov oynasidan
  // ALLAQACHON kelardi, lekin sxemada yo'q edi: Zod ularni jimgina tashlab
  // yuborardi va server «0 to'landi» deb 400 qaytarardi. Ya'ni terminal bilan
  // to'lagan yoki qarzga olgan mijozning cheki umuman rasmiylashmasdi.
  // `.default('0')` — eski chaqiruvchilar (moysklad-compat, testlar) buzilmasin.
  terminalAmountMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'terminalAmountMinor must be a non-negative integer')
    .default('0'),
  debtAmountMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'debtAmountMinor must be a non-negative integer')
    .default('0'),
  /** Qarzga sotishda MAJBURIY — qarz kimning balansiga yozilishi (TZ §7.1). */
  agentId: z.string().uuid().optional(),
  /** Client-side sanity check — server revalidates against DB sum */
  expectedSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'expectedSumMinor must be a non-negative integer'),
});
export type PostRetailSaleInput = z.infer<typeof PostRetailSaleSchema>;

// --- Refund ---

export const RefundRetailSaleSchema = z.object({
  /** Positions to refund. Must be a subset of original positions. */
  positions: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce
          .string()
          .regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
        priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
        discount: discountPercent.default('0'),
      }),
    )
    .min(1, 'at least one position required for refund'),
  cashAmountMinor: z.coerce.string().regex(/^\d+$/).default('0'),
  cardAmountMinor: z.coerce.string().regex(/^\d+$/).default('0'),
  description: z.string().max(4000).nullish(),
});
export type RefundRetailSaleInput = z.infer<typeof RefundRetailSaleSchema>;

// --- List filter ---

export const RetailSaleFilterSchema = z.object({
  sessionId: z.string().uuid().optional(),
  state: RetailSaleStateSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type RetailSaleFilterInput = z.infer<typeof RetailSaleFilterSchema>;
