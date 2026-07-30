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
// A product's designated storage cell is Product.attributes.__yacheyka (the cell
// CODE) + __polka (the zone name) — the SAME binding the product card's
// «Полка»/«Ячейка» pickers write. Assigning from the cell side mirrors it, so a
// product has ONE home cell and both views stay in sync. This is a location
// LABEL, never a stock quantity (qty stays document-derived → no drift).
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
// Absolute set — «30» means the cell now holds exactly 30 of the product.
export const SetCellStockSchema = z.object({
  assortmentId: uuid,
  qty: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a non-negative decimal (≤6 dp)'),
});
export type SetCellStockInput = z.infer<typeof SetCellStockSchema>;

// ---- Ommaviy yaratish (diapazon generatori) ----
//
// Bu sxema FAQAT shakl va tipni tekshiradi. Semantik qoidalar — diapazon
// chegaralari (`from > to`), harflar A–Z ekani, 5000 chegara, takroriy nom,
// nom uzunligi — `cell-range.util.ts` dagi `countOf`/`expandCellRange` da,
// bitta joyda. Bu yerda takrorlansa, bitta xato ikki xil xabar bilan chiqadi.
// Xususan `to` uchun ataylab `.max()` YO'Q: util massiv qurishdan OLDIN
// arifmetik sanaydi, ya'ni katta diapazon xotirani yemasdan rad etiladi.

/** Bitta shablon o'zgaruvchisi. Yoyish qoidalari — `cell-range.util.ts`. */
const rangeVariable = z.discriminatedUnion('kind', [
  z.object({
    key: z.string().trim().min(1).max(40),
    kind: z.literal('number'),
    from: z.coerce.number().int().min(0),
    to: z.coerce.number().int().min(0),
    pad: z.coerce.number().int().min(0).max(6).optional(),
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
