import { z } from 'zod';

/**
 * RestockTask (Sherset custom) — «Joylashtirish vazifasi». A cashier sends a
 * posted SalesReturn's goods to a warehouse-keeper (omborchi) to be put back on
 * their home shelves. The task snapshots each returned product + its bin location
 * code; the omborchi confirms each line (scan the senik QR or press «placed»).
 */

const uuid = z.string().uuid();

export const CreateRestockFromSalesReturnSchema = z.object({
  salesReturnId: uuid,
  /** The warehouse-keeper employee the task is assigned to. */
  assigneeId: uuid,
  note: z.string().max(1000).optional(),
});
export type CreateRestockFromSalesReturnInput = z.infer<typeof CreateRestockFromSalesReturnSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const RestockTaskFilterSchema = z.object({
  // 'cancelled' — manba hujjat bekor qilinganda yopiladi (masalan kassir
  // yig'ilayotgan chekni bekor qilsa): omborchi yo'q sotuv uchun tovar
  // yig'masligi kerak, lekin 'done' deb belgilash «yig'ib bo'lindi» degan
  // yolg'on bo'lardi.
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
  /** 'restock' (inbound, default view) or 'picking' (outbound) — omit = all. */
  type: z.enum(['restock', 'picking']).optional(),
  /** Filter to one source document (e.g. all picking tasks of one order). */
  sourceId: uuid.optional(),
  assigneeId: uuid.optional(),
  /** Only tasks assigned to the current user (the omborchi's own queue). */
  mine: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * G6 — TSD oflayn navbatining idempotentlik kaliti (`shared/client-op.ts`).
 * Web ekranlari uni YUBORMAYDI (brauzerda navbat yo'q) ⇒ ixtiyoriy.
 */
const clientOpId = z.string().trim().min(1).max(64).optional();

/** Manual per-line confirm — optional productId echo for an extra safety check. */
export const ConfirmLineSchema = z.object({
  productId: uuid.nullish(),
  clientOpId,
});

/** QR-scan confirm — the scanned product id (parsed from the senik QR URL). */
export const ConfirmScanSchema = z.object({
  productId: uuid,
  clientOpId,
});

/**
 * G6 — YETISHMOVCHILIK belgisi: «javonda shuncha topolmadim».
 *
 * `qty` MUTLAQ son (delta EMAS) — sabab `restock-task-progress.ts`
 * `planShortage` izohida: oflayn navbat amalni qayta yuborishi mumkin va
 * mutlaq son qayta yuborilganda AYNI natijani beradi. `0` — belgini olib
 * tashlash (omborchi tovarni keyin topib olishi normal holat).
 */
export const ShortageSchema = z.object({
  qty: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a non-negative decimal (<=6 dp)'),
  note: z.string().trim().max(500).optional(),
  clientOpId,
});

/**
 * K4 — BO'LINADIGAN TOVAR KESIMI (kabel/sim/shlang).
 *
 * Manba IKKI yo'l bilan ko'rsatiladi va ikkalasi ham kerak:
 *   · `label` — omborchi javondagi `BLK-` yorlig'ini SKANERLAYDI (asosiy yo'l);
 *   · `pieceId` — ekrandagi ro'yxatdan tanlaydi (butun rulonda yorliq UMUMAN
 *     yo'q — K-Q3, ya'ni uni faqat ro'yxatdan tanlash mumkin).
 *
 * `remainingLength` IXTIYORIY: tizim `manba − kesim` ni taklif qiladi, omborchi
 * esa HAQIQIY o'lchovni yozadi (K-reja 5-bo'lim, «o'z-o'zini tuzatish»). Farq
 * `cut-loss` qatori bo'lib reyestrdan chiqadi va QOLDIQQA TEGILMAYDI
 * (egasining 2026-08-25 qarori).
 *
 * Uzunliklar SATR (`Decimal(20,6)`) — `number` ga o'girish 0.1+0.2 klassidagi
 * yo'qotishni aynan kesim hisobiga olib kirardi.
 */
export const CutPieceSchema = z
  .object({
    pieceId: uuid.optional(),
    label: z.string().trim().min(1).max(40).optional(),
    cutLength: z.string().trim().min(1).max(32),
    remainingLength: z.string().trim().max(32).nullish(),
    clientOpId,
  })
  .refine((d) => d.pieceId !== undefined || (d.label !== undefined && d.label.length > 0), {
    message: "Manba bo'lak ko'rsatilmadi (yorliqni skanerlang yoki ro'yxatdan tanlang)",
  });
