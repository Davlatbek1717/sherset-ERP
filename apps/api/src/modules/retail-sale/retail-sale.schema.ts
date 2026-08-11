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

/**
 * F8 — POS'dan to'lash mumkin bo'lgan CustomerOrder holatlari.
 *
 * `draft` ATAYLAB yo'q: rezerv aynan `draft → confirmed` o'tishida tushadi
 * (`customer-order.service.applyReservationInvariant('hold-remaining')`), ya'ni
 * tasdiqlanmagan zakazni to'lash tovar hech qachon band qilinmagan holda uni
 * sotardi. POS'da tasdiqlash tugmasi bor (F7) — kassir avval tasdiqlaydi.
 *
 * `partially_shipped` ham yo'q: `applyPayment` uni qabul qiladi-yu, POS
 * qisman jo'natilgan zakazni butunlay sotmaydi — bu yuzani tor tutamiz.
 *
 * 🔴 Bu ro'yxat AYNI paytda ikki marta to'lash himoyasining predikati:
 * `post()` ichidagi `updateMany WHERE state IN (…)` shu qiymatlardan quriladi,
 * ya'ni `paid` zakaz predikatga tushmaydi va ikkinchi to'lov `count = 0` oladi.
 */
export const ORDER_PAYABLE_STATES = ['confirmed', 'awaiting_payment'] as const;
export type OrderPayableState = (typeof ORDER_PAYABLE_STATES)[number];

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
  /**
   * F8 — chek qaysi zakazni yopayotgani. Ustun/relation/indeks sxemada
   * ALLAQACHON bor edi (`schema.prisma` → `RetailSale.customerOrderId`), lekin
   * hech bir kod unga yozmasdi: ulanish nuqtasi tayyor, sim tortilmagan edi.
   * Ixtiyoriy — oddiy kassa cheki (zakazsiz) hech narsa yubormaydi.
   */
  customerOrderId: z.string().uuid().nullish(),
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

export const PostRetailSaleSchema = z
  .object({
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
    /**
     * Dollar naqd — mijoz bergan summa SENTDA (MK31 · TZ §6.2).
     * `.default('0')` — dollarsiz kassa uchun hech narsa o'zgarmaydi.
     */
    cashUsdAmountMinor: z.coerce
      .string()
      .regex(/^\d+$/, 'cashUsdAmountMinor must be a non-negative integer')
      .default('0'),
    /**
     * Qo'llanilgan kurs — KANONIK ×10^8 (DB-01, Faza 16; `Currency.rateValue`
     * va `DebtPayment.exchangeRate` bilan bir xil): 12 450,27 so'm →
     * '1245027000000'. Chekka MUZLATILADI.
     */
    usdRateMinor: z.coerce.string().regex(/^\d+$/, 'usdRateMinor must be an integer').optional(),
    /** Client-side sanity check — server revalidates against DB sum */
    expectedSumMinor: z.coerce
      .string()
      .regex(/^\d+$/, 'expectedSumMinor must be a non-negative integer'),
  })
  // TZ §6.2: kurs topilmasa to'lov BLOKLANADI — sentni tiyin deb jim qabul
  // qilish chekni haqiqiy summaning ~12 000 dan biriga yopardi.
  .refine((v) => BigInt(v.cashUsdAmountMinor) === 0n || v.usdRateMinor != null, {
    message: 'Dollar to‘lovida kurs majburiy',
    path: ['usdRateMinor'],
  })
  // DB-01 (Faza 16): eski ×10^4 masshtabdagi klient qiymati kanonik deb
  // o'qilsa 10 000× xato bo'lardi. Real USD kursi 10 so'mdan (10^9) ming
  // barobar yuqori, stale qiymat esa doim past — past qiymat JIM o'tmaydi.
  // (`debt.schema.ts` dagi bir xil qo'riqchi bilan bitta qoida.)
  .refine((v) => v.usdRateMinor == null || BigInt(v.usdRateMinor) >= 1_000_000_000n, {
    message: 'Kurs eski (×10⁴) masshtabda — sahifani yangilang (kanonik ×10⁸)',
    path: ['usdRateMinor'],
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
        /**
         * SALES-01: IGNORED by the server. The refund is priced from the
         * original receipt (`priceRefundFromOriginal`) — trusting these made
         * the payout cap self-referential. Optional so a client need not send
         * them; kept accepted so existing callers do not break.
         */
        priceMinor: z.coerce
          .string()
          .regex(/^\d+$/, 'priceMinor must be a non-negative integer')
          .optional(),
        discount: discountPercent.optional(),
      }),
    )
    .min(1, 'at least one position required for refund'),
  cashAmountMinor: z.coerce.string().regex(/^\d+$/).default('0'),
  cardAmountMinor: z.coerce.string().regex(/^\d+$/).default('0'),
  /**
   * SALES-04 — qarzga sotilgan chek qaytarilganda mijoz balansidan
   * o'chiriladigan qarz ulushi. **Berilmasa** server o'zi hisoblaydi:
   * chekning qarz ulushi qaytarilgan qiymatga proporsional yopiladi.
   * Bu ataylab shunday — eski klientlar (POS) hech narsa yubormaydi, va
   * «qarzga olgan mijoz tovarni qaytardi, qarzi qolaveradi» holati
   * o'z-o'zidan yopiladi. Berilgan qiymat esa cheklanadi
   * (`computeRefundSettlementCaps`), oshirib bo'lmaydi.
   */
  debtReturnMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'debtReturnMinor must be a non-negative integer')
    .optional(),
  description: z.string().max(4000).nullish(),
});
export type RefundRetailSaleInput = z.infer<typeof RefundRetailSaleSchema>;

// --- Z-report query ---

/**
 * GET /retail-sales/z-report?sessionId=… — controller query'ni validatsiyasiz
 * uzatardi: noto'g'ri/berilmagan uuid Prisma'gacha yetib P2023 bilan 500
 * qaytarardi. Endi servis kirishda shu sxema bilan tekshiradi — ZodError'ni
 * global filtr 400 qiladi.
 */
export const ZReportQuerySchema = z.object({
  sessionId: z.string().uuid(),
});
export type ZReportQueryInput = z.infer<typeof ZReportQuerySchema>;

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
