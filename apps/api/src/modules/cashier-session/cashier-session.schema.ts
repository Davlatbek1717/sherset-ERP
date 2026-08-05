import { z } from 'zod';

/**
 * CashierSession — shift at a CashDesk.
 *
 * FSM: open → closed
 *   - open: cashier can create RetailSales
 *   - closed: immutable; discrepancy recorded
 *
 * Invariant: one open session per cashier at a time (enforced in service).
 */

export const SessionStateSchema = z.enum(['open', 'closed']);
export type SessionState = z.infer<typeof SessionStateSchema>;

// --- Open shift ---

export const OpenSessionSchema = z.object({
  cashDeskId: z.string().uuid(),
  storeId: z.string().uuid(),
  organizationId: z.string().uuid(),
  openingCashMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'openingCashMinor must be a non-negative integer')
    .default('0'),
  description: z.string().max(4000).nullish(),
  // moysklad «Внешний код» — universal external-system sync key (the
  // CashierSession model already carries the column; exposes it for
  // POS-register / external-till linking at shift open).
  externalCode: z.string().max(50).nullish(),
});
export type OpenSessionInput = z.infer<typeof OpenSessionSchema>;

// --- Close shift ---

export const CloseSessionSchema = z.object({
  closingCashMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'closingCashMinor must be a non-negative integer'),
  description: z.string().max(4000).nullish(),
  /**
   * Kassirning farq bo'yicha izohi — farq aktiga yoziladi.
   *
   * ⚠️ **USD sanoq maydoni ATAYLAB YO'Q** (TZ §8.4 «UZS va USD alohida»).
   * USD naqd oqimi hali ulanmagan: `retail-sale.service.ts` to'lovni har
   * doim kassa valyutasida yozadi («CASH_USD ulanganda...» degan ochiq
   * joy). Kutilgan USD hisoblanmaydigan holatda uni 0 deb olish har
   * smenada soxta «USD ortiqcha» akti berardi — menejer bir hafta ichida
   * farq ogohlantirishlarini butunlay e'tiborsiz qoldirardi.
   * USD sanoq CASH_USD bilan BIRGA qo'shiladi.
   */
  varianceNote: z.string().trim().max(4000).nullish(),
});
export type CloseSessionInput = z.infer<typeof CloseSessionSchema>;

// --- Drawer cash in/out (Внесение / Изъятие within an OPEN shift) ---
//
// moysklad RetailDrawerCashIn / RetailDrawerCashOut. The models already
// exist (schema.prisma; gap-report 100%) — this is the §100 exposure
// gap. sumMinor is the cash amount in tiyin; must be > 0 (a zero/
// negative drawer operation is meaningless).

export const DrawerCashSchema = z.object({
  sumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'sumMinor must be a non-negative integer')
    // > 0 check WITHOUT BigInt() — BigInt throws on non-digit input
    // (e.g. '12.5', coerced-undefined 'undefined') which would escape
    // safeParse as an exception. Given the regex guarantees digit-only,
    // a value is > 0 iff it contains at least one non-zero digit.
    .refine((v) => /[1-9]/.test(v), 'sumMinor must be greater than 0'),
  description: z.string().max(4000).nullish(),
});
export type DrawerCashInput = z.infer<typeof DrawerCashSchema>;

/**
 * Xarajat (RKO) / inkassatsiya — kassa TZ §8.2 / §8.3.
 *
 * `kind` ni MIJOZ yuboradi, lekin qaysi maydon majburiy ekanini schema
 * emas, sof `validateCashOut` hal qiladi: bir xil qoida servis ichida ham,
 * testda ham bitta manbadan o'qiladi.
 */
export const PosCashOutSchema = z.object({
  kind: z.enum(['expense', 'collection']),
  sumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'sumMinor must be a non-negative integer')
    .refine((v) => /[1-9]/.test(v), 'sumMinor must be greater than 0'),
  expenseItemId: z.string().uuid().nullish(),
  recipientId: z.string().uuid().nullish(),
  description: z.string().trim().max(4000).nullish(),
});
export type PosCashOutInput = z.infer<typeof PosCashOutSchema>;

// --- List filter ---

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const SessionFilterSchema = z.object({
  state: SessionStateSchema.optional(),
  // moysklad «Смены» toolbar search box. The shift `name` (document №) is not
  // yet populated on open (defaults to ''), and our list links by cashier, so
  // search matches the cashier name (primary, per the «Имя кассира…»
  // placeholder) + the shift comment — mirroring moysklad's «Номер или
  // комментарий» search adapted to our cashier-keyed redesign.
  search: z.string().trim().min(1).optional(),
  cashierId: z.string().uuid().optional(),
  cashDeskId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['openedAt', 'closedAt', 'createdAt', 'salesSumMinor']).default('openedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type SessionFilterInput = z.infer<typeof SessionFilterSchema>;

void boolFromString; // suppress unused warning
