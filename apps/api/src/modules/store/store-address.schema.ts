import { z } from 'zod';

/**
 * Address storage (Адресное хранение товаров) — Zod schemas for the
 * per-warehouse Zone (Зона) + Cell (Ячейка) CRUD. Mirrors moysklad's warehouse
 * card «Адресное хранение товаров»: zones group cells; a cell may sit in a zone
 * or in the implicit «Без зоны хранения» bucket (zoneId = null).
 */

const uuid = z.string().uuid();

// Empty string from a form field ⇒ null (not "").
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

const name = z.string().trim().min(1, 'Nomi boʻsh boʻlmasligi kerak').max(255);
const sortOrder = z.coerce.number().int().min(0).max(1_000_000).optional();

// ---- Zone (Зона) ----
export const CreateZoneSchema = z.object({
  name,
  sortOrder,
});
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;

export const UpdateZoneSchema = z.object({
  name: name.optional(),
  sortOrder,
});
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;

// ---- Cell (Ячейка) ----
export const CreateCellSchema = z.object({
  name,
  // null / omitted ⇒ «Без зоны хранения». A provided id must belong to the same
  // store (verified in the service).
  zoneId: uuid.nullish(),
  // «Штрихкод» — optional scan code.
  barcode: optionalText(255),
  sortOrder,
});
export type CreateCellInput = z.infer<typeof CreateCellSchema>;

export const UpdateCellSchema = z.object({
  name: name.optional(),
  // Tri-state: undefined = leave as-is · null = move to «Без зоны» · uuid = reassign.
  // `.nullish()` preserves an explicit null distinct from undefined.
  zoneId: uuid.nullish(),
  barcode: optionalText(255),
  sortOrder,
});
export type UpdateCellInput = z.infer<typeof UpdateCellSchema>;

// ---- «Добавить товар в ячейку» — assign products to a cell (user 2026-07-06) ----
// Multi-bin (2026-08-06): a product can now be bound to SEVERAL cells at once
// (ProductCellLink, many-to-many) — assigning ADDS a binding, it never moves
// the product out of a cell it's already in. `Product.attributes.__yacheyka`
// (+ __polka) still caches the FIRST cell it was ever bound to (seeded once,
// never overwritten by this endpoint) for readers that only want a single
// label — the product card's «Полка»/«Ячейка» pickers, print labels, the
// pick-list resolver. This is a location LABEL, never a stock quantity (qty
// stays document-derived → no drift).
export const AssignProductsSchema = z.object({
  productIds: z.array(uuid).min(1).max(500),
});
export type AssignProductsInput = z.infer<typeof AssignProductsSchema>;

// ---- Scan flow (owner 2026-07-19): cell lookup by its printed barcode ----
export const CellBarcodeLookupSchema = z.object({
  code: z.string().trim().min(1, 'Kod kiritilishi shart').max(255),
});
export type CellBarcodeLookupInput = z.infer<typeof CellBarcodeLookupSchema>;

// ---- «Sanash» (owner 2026-07-21): physical count of ONE product in ONE cell ----
// Ikki semantika bitta endpointda — `mode` ni qara.
export const SetCellStockSchema = z.object({
  assortmentId: uuid,
  qty: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a non-negative decimal (≤6 dp)'),
  /**
   * TZ v3: `set` (default) — sanoq MUTLAQ, yacheyka qoldig'i aynan `qty` ga
   * tenglashadi (oddiy rejim / inventarizatsiya). `add` — «Umumiy sanash»:
   * `qty` mavjud qoldiqqa QO'SHILADI va avto-hujjat aynan `qty` ga yoziladi.
   * Default ataylab `set` — eski chaqiruvchilar xulqi o'zgarmaydi.
   */
  mode: z.enum(['set', 'add']).default('set'),
});
export type SetCellStockInput = z.infer<typeof SetCellStockSchema>;

// ---- Ommaviy yaratish (diapazon generatori) ----
//
// Bu sxema FAQAT shakl va tipni tekshiradi. HAMMA semantik qoida —
// `cell-range.util.ts` dagi `countOf`/`expandCellRange` da, bitta manzilda.
//
// Shuning uchun bu yerda ATAYLAB YO'Q (qaytarib qo'shmang):
//   · `from`/`to` da `.min(0)` — manfiy diapazonni `countOf` rad etadi va
//     xatoda o'zgaruvchi NOMINI beradi («a»: manfiy son bo'lmaydi), Zod esa
//     umumiy «greater than or equal to 0» berardi va aniq xabar hech qachon
//     ishga tushmasdi (o'lik shox).
//   · `pad` da `.min(0).max(6)` — xuddi shu sabab, `countOf` xabari aniqroq.
//   · `to` da `.max()` — util massiv qurishdan OLDIN arifmetik sanaydi,
//     ya'ni katta diapazon xotirani yemasdan rad etiladi.
// Takrorlansa bitta xato ikki xil xabar bilan chiqadi — bu loyihada
// qayta-qayta chiqqan bug-klass.
//
// `variables` dagi `.max(6)` esa semantik qoida EMAS — u kirishning SHAKLI
// (nechta element) va dekart ko'paytmasi portlashiga qarshi DoS himoyasi,
// shuning uchun Zod'da qoladi.

/** Bitta shablon o'zgaruvchisi. Yoyish qoidalari — `cell-range.util.ts`. */
const rangeVariable = z.discriminatedUnion('kind', [
  z.object({
    key: z.string().trim().min(1).max(40),
    kind: z.literal('number'),
    from: z.coerce.number().int(),
    to: z.coerce.number().int(),
    pad: z.coerce.number().int().optional(),
  }),
  z.object({
    key: z.string().trim().min(1).max(40),
    kind: z.literal('letter'),
    from: z.string().trim().length(1),
    to: z.string().trim().length(1),
  }),
]);

export const BulkCreateCellsSchema = z.object({
  template: z.string().trim().min(1, 'Shablon boʻsh boʻlmasligi kerak').max(255),
  // 6 tadan ortiq o'zgaruvchi amalda uchramaydi va dekart ko'paytmasini
  // portlatadi — chegara qo'yiladi (yoyish o'zi ham 5000 da to'xtaydi).
  variables: z.array(rangeVariable).min(1).max(6),
  zoneFrom: z.string().trim().min(1).max(40).nullable(),
  /** true ⇒ hech narsa yozilmaydi, faqat sanoq qaytadi. */
  dryRun: z.boolean().default(false),
});
export type BulkCreateCellsInput = z.infer<typeof BulkCreateCellsSchema>;
