import { z } from 'zod';

/**
 * G6 — TSD oflayn navbatining idempotentlik kaliti (`shared/client-op.ts`).
 *
 * Bu IKKI marshrut aynan shu kalitga muhtoj: ular QAYTARIB BO'LMAYDIGAN
 * amallar (qoldiqni siljitadi) va TSD aloqasi uzilganda qayta yuboriladi —
 * kalitsiz 10 dona o'rniga 20 ko'chirilardi. Web ekranlari kalitni
 * yubormaydi (brauzerda navbat yo'q) ⇒ ixtiyoriy va ular uchun xulq
 * o'zgarmaydi.
 */
const clientOpId = z.string().trim().min(1).max(64).optional();

/**
 * «Переместить по ячейкам» — move stock of ONE product from one address-storage
 * cell to another WITHIN THE SAME store. Pure per-cell redistribution: the two
 * deltas net to zero at store level (−qty on the source cell, +qty on the
 * target), so total on-hand / cost stay untouched — only StockByCell moves.
 *
 * `qty` is a positive Decimal(20,6) string (matches the StockByCell column) so
 * large/fractional quantities carry no float drift.
 */
export const CellMoveSchema = z
  .object({
    storeId: z.string().uuid(),
    fromCellId: z.string().uuid(),
    toCellId: z.string().uuid(),
    qty: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a positive decimal (≤6 dp)')
      .refine((v) => Number(v) > 0, 'qty must be greater than 0'),
    clientOpId,
  })
  .refine((v) => v.fromCellId !== v.toCellId, {
    message: 'fromCellId and toCellId must differ',
    path: ['toCellId'],
  });

export type CellMoveInput = z.infer<typeof CellMoveSchema>;

/**
 * «Переместить» on a HOME-CELL binding row (LABEL model, user 2026-07-06) —
 * re-assign the product's home cell to another StoreCell. Pure label move
 * (updates attributes `__yacheyka`/`__polka`); no stock moves, so no qty.
 */
export const CellRebindSchema = z.object({
  toCellId: z.string().uuid(),
});

export type CellRebindInput = z.infer<typeof CellRebindSchema>;

/**
 * «Переместить» on a HOME-CELL binding row when the qty model applies — PLACE
 * `qty` units of the product's unallocated on-hand (the «remainder on the home
 * shelf») into a real target cell of the home cell's store. Increases
 * StockByCell[target] only; store-level stock is untouched.
 */
export const CellPlaceSchema = z.object({
  toCellId: z.string().uuid(),
  qty: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a positive decimal (≤6 dp)')
    .refine((v) => Number(v) > 0, 'qty must be greater than 0'),
  clientOpId,
});

export type CellPlaceInput = z.infer<typeof CellPlaceSchema>;
