import { z } from 'zod';
import { DecimalString, MinorAmount, Uuid } from './wire.js';

/**
 * One entry of the `Product.salePrices` JSON column.
 *
 * Mirrors `SalePriceSchema` in `apps/api/src/modules/product/product.schema.ts`
 * (`{ priceTypeId, value: bigIntString, currencyCode }`). `value` is stored as
 * a minor-unit STRING, not a number — see `wire.ts` rule 1.
 */
export const SalePriceEntrySchema = z.object({
  priceTypeId: z.string().min(1),
  value: MinorAmount,
  currencyCode: z.string().length(3).optional(),
});
export type SalePriceEntry = z.infer<typeof SalePriceEntrySchema>;

/**
 * The live per-product stock block `ProductRepository.attachStock` bolts onto
 * every `GET /products` row. Every figure is a `Prisma.Decimal` summed across
 * stores → decimal STRING on the wire.
 *
 * ⚠️ `available` here is moysklad's DISPLAY formula
 * `Остаток − Резерв + Ожидание` (`product.repository.ts`, design §6), NOT the
 * physical posting check `qty − reserved` that `StockService.assertAvailable`
 * uses. Do not reuse this number to decide whether a shipment can be posted.
 */
export const ProductStockSchema = z.object({
  onHand: DecimalString,
  reserved: DecimalString,
  inTransit: DecimalString,
  available: DecimalString,
});
export type ProductStock = z.infer<typeof ProductStockSchema>;

/**
 * `GET /products` row — the POS projection.
 *
 * A documented LOWER BOUND, not the whole row: `product.repository.ts:345` uses
 * a Prisma `include`, so the response carries every `Product` scalar plus its
 * relations. These are the keys the two POS pages actually read, and both
 * pages previously declared them separately and differently (FE-12):
 *
 *   - `sotuv/page.tsx`  → `{ id, name, code, buyPrice, salePrices, stock }`
 *   - `retail/page.tsx` → `{ id, name, code, salePrices }` — no `buyPrice`, no `stock`
 *
 * Neither declared `stock.inTransit`, which the server has been sending all
 * along. Both were subsets of the truth rather than wrong, but nothing said so.
 *
 * `stock` is optional here because `attachStock` only runs on the paginated
 * list path (`product.repository.ts:379`); other `/products`-shaped payloads
 * (the storage-location sub-list) omit it.
 */
export const PosProductRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  code: z.string().nullable(),
  /** `BigInt?` column → string or null on the wire. */
  buyPrice: MinorAmount.nullable().optional(),
  salePrices: z.array(SalePriceEntrySchema).nullable().optional(),
  stock: ProductStockSchema.nullable().optional(),
  /**
   * K3 (bo'linadigan tovar — kabel/sim/shlang): «Bo'lak hisobi yuritilsin».
   * `optional` — maydon `Product` da 2026-08-25 dan bor, lekin bu shakl
   * QUYI CHEGARA (yuqoridagi izoh) va eski javoblarda bo'lmasligi mumkin.
   * POS uni ko'rib bo'lak tarkibini so'raydi; `false`/yo'q bo'lsa ekran
   * bir bayt ham o'zgarmaydi.
   */
  pieceTracked: z.boolean().optional(),
});
export type PosProductRow = z.infer<typeof PosProductRowSchema>;
