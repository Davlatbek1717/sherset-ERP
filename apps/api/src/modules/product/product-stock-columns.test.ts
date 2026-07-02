import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Per-product «Остаток»/«Резерв»/«Ожидание»/«Доступно» list columns — live-stock
 * source gate (permanent regression guard).
 *
 * Parity: moysklad's assortment list shows a stock cluster (Остаток / Резерв /
 * Ожидание / Доступно — DOM-grounded as column headers in the stock-report
 * capture and as a column-customizer option in the products capture). We surface
 * all four. The physical axes (Остаток / Резерв) are aggregated from the LIVE
 * Stock ledger at query time (SUM(qty), SUM(reserved_qty) across stores for the
 * current page's product ids); «Ожидание» is derived query-time from active
 * supplier-order positions by the shared `StockInTransitService` (summed across
 * stores) — the SAME source the stock-balance report uses. They are NOT a
 * denormalised rollup: the old `Product.stock_minor`/`reserve_minor` columns
 * were designed-but-unwired (permanently DEFAULT 0) — reading those would print
 * a silently-wrong 0 for every product (the exact bug-class the 11g/11h filter
 * audit fixed) — and were DROPPED 2026-06-12 (see the schema-absence guard at the
 * bottom of this file).
 *
 * 🔴 The correctness invariant this guard pins (design `_IN-TRANSIT-OZHIDANIE-
 * DESIGN-2026-06-12.md` §6/§211, which names THIS products-list site):
 *   - DISPLAY «Доступно» = Остаток − Резерв + Ожидание (moysklad's available-to-
 *     promise formula; worked example 27 − 1 + 55 = 81). This list and the
 *     stock-balance report MUST agree — both fold in-transit into «Доступно».
 *     (Before 11w made in-transit live this was `on-hand − reserved`; with
 *     in-transit ≡ 0 that was equal, but it silently under-reported once 11w
 *     wired in-transit on the report only — this guard now pins the fixed,
 *     consistent formula.)
 *   - This DISPLAY formula must NOT be confused with the POSTING-sufficiency
 *     check `StockService.assertAvailable`, which stays PHYSICAL `qty − reserved`
 *     (you cannot ship goods that have not physically arrived). §2c is the
 *     posting check, NOT the display definition — the 11i comment conflated them.
 */

const REPO = join(__dirname, 'product.repository.ts');

// Strip comments before the banned-pattern scans — the doc-comment names the
// dead columns and «Ожидание» to explain why they are avoided, so a raw scan
// would match the explanation, not live code.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('product list stock columns read the LIVE Stock ledger', () => {
  const src = readFileSync(REPO, 'utf8');
  const code = stripComments(src);

  it('aggregates the maintained Stock ledger (groupBy assortmentId, SUM qty + reservedQty)', () => {
    expect(code).toMatch(/\.stock\.groupBy\(/);
    expect(code).toMatch(/by:\s*\[['"]assortmentId['"]\]/);
    // only product-kind rows belong to a Product row
    expect(code).toMatch(/assortmentKind:\s*['"]product['"]/);
    // both axes summed (on-hand + reserved)
    expect(code).toMatch(/_sum:\s*\{[^}]*\bqty:\s*true/);
    expect(code).toMatch(/_sum:\s*\{[^}]*\breservedQty:\s*true/);
  });

  it('restricts the aggregate to the current page ids (not a table scan)', () => {
    expect(code).toMatch(/assortmentId:\s*\{\s*in:/);
  });

  it('computes DISPLAY «Доступно» = on-hand − reserved + in-transit (moysklad available-to-promise)', () => {
    // Остаток − Резерв + Ожидание — must agree with the stock-balance report.
    expect(code).toMatch(/onHand\.minus\(reserved\)\.plus\(inTransit\)/);
  });

  it('derives «Ожидание» query-time via the shared StockInTransitService (not a denormalised column)', () => {
    // Single source of truth shared with the report; summed across stores to
    // mirror this list's cross-store Stock aggregate.
    expect(code).toMatch(/getInTransitByAssortment/);
    expect(code).toMatch(/inTransitAssortmentKey\(\s*['"]product['"]/);
    // Never read the (dropped) always-0 Stock.inTransitQty column.
    expect(code).not.toMatch(/inTransitQty/);
  });

  it('emits the four columns as the stock rollup shape', () => {
    expect(code).toMatch(/onHand:/);
    expect(code).toMatch(/reserved:/);
    expect(code).toMatch(/inTransit:/);
    expect(code).toMatch(/available:/);
  });

  it('does NOT read the dead denormalised columns (stock_minor / reserve_minor)', () => {
    // Non-vacuous: reading these would resurrect the permanently-0 bug-class.
    expect(code).not.toMatch(/\bstockMinor\b/);
    expect(code).not.toMatch(/\breserveMinor\b/);
    expect(code).not.toMatch(/\bstock_minor\b/);
    expect(code).not.toMatch(/\breserve_minor\b/);
  });
});

/**
 * The vestigial per-product denormalised rollup columns
 * (`Product.stock_minor` / `reserve_minor` / `in_transit_minor`) were DROPPED
 * from the schema on 2026-06-12 (migration
 * `…_drop_vestigial_product_denorm_stock_columns`). They were designed-but-
 * unwired (no app write / trigger / seed ⇒ permanently DEFAULT 0) and had
 * already caused one silent-wrong bug (the 11h «Ниже минимума» filter compared
 * against the dead `stock_minor`). Both live consumers aggregate the Stock
 * ledger at query time, so nothing referenced them. This guard pins the drop so
 * the dead denormalisation cannot be re-introduced and tempt a future reader.
 *
 * `stock_minor` / `reserve_minor` / `in_transit_minor` are unique to the Product
 * model (PurchaseOrder uses `*_sum_minor`; PurchaseOrderPosition uses
 * `in_transit_qty`), so a whole-schema absence scan is unambiguous.
 */
const SCHEMA = join(__dirname, '..', '..', '..', '..', '..', 'packages/db/prisma/schema.prisma');

describe('the vestigial denormalised Product stock columns are dropped from the schema', () => {
  // Strip `//`/`///` comments first — the Product model retains a doc-comment
  // that names the dropped columns to explain the removal, so a raw token-ban
  // would match the explanation, not a live field declaration.
  const schema = stripComments(readFileSync(SCHEMA, 'utf8'));

  it('no longer declares stock_minor / reserve_minor / in_transit_minor', () => {
    expect(schema).not.toMatch(/\bstock_minor\b/);
    expect(schema).not.toMatch(/\breserve_minor\b/);
    expect(schema).not.toMatch(/\bin_transit_minor\b/);
  });

  it('no longer declares the camelCase Prisma fields', () => {
    expect(schema).not.toMatch(/\bstockMinor\b/);
    expect(schema).not.toMatch(/\breserveMinor\b/);
    expect(schema).not.toMatch(/\binTransitMinor\b/);
  });
});
