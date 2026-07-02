import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Ниже минимума» re-order filter — live-stock source gate (permanent
 * regression guard).
 *
 * Bug-class (Convention-4 filter audit, 2026-06-11g → fixed 11h): the filter on
 * the products/bundles/services lists compared the denormalised
 * `Product.stock_minor` column against `minimum_balance_minor`. But
 * `stock_minor` was a designed-but-unwired denormalisation — no application
 * write, no DB trigger, no seed — so it was permanently its migration DEFAULT 0
 * (the column was ultimately DROPPED 2026-06-12, see product-stock-columns.test).
 * Two faults followed:
 *   1. `0 < minimum_balance_minor` is TRUE for every product that has any
 *      minimum configured, so `belowMinimum=true` returned ALL such products
 *      regardless of real stock (actively wrong, not merely empty); and
 *   2. the `if (filter.belowMinimum)` guard is falsy for the boolean `false`,
 *      so the tri-state `false` («Достаточно») branch silently fell through to
 *      no-filter and returned everything.
 *
 * The fix aggregates the LIVE Stock ledger per product (SUM(qty) across stores,
 * the same materialised table stock-balance.service reads), in the ×1000
 * milliunit scale that minimumBalanceMinor is stored in (Stock.qty is whole
 * units → qty × 1000; the product form stores user-units × 1000). It branches
 * the comparison on the boolean so BOTH `true` (stock < min) and `false`
 * (stock ≥ min) filter correctly, and never touches the dead `stock_minor`
 * column. Verified live (verify-below-minimum-smoke.mjs): a product stocked
 * below its minimum appears under `true`, a sufficiently-stocked one appears
 * under `false`, a no-minimum product appears under neither, and a product
 * whose stock is split across two stores is summed before comparison.
 */

const REPO = join(__dirname, 'product.repository.ts');

// Strip comments before the banned-pattern scans — the fix's own doc-comment
// quotes the old `stock_minor < minimum_balance_minor` query to explain the
// bug, so a raw word-ban would match the explanation, not live code.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('belowMinimum filter reads LIVE Stock (not the dead stock_minor column)', () => {
  const src = readFileSync(REPO, 'utf8');
  const code = stripComments(src);

  it('aggregates the live Stock ledger (SUM(qty) per assortment) instead of a denormalised column', () => {
    expect(code).toMatch(/SUM\(qty\)\s+AS\s+total_qty/);
    expect(code).toMatch(/FROM stocks/);
    expect(code).toMatch(/GROUP BY assortment_id/);
    // joins the per-product rollup to the product by id
    expect(code).toMatch(/s\.assortment_id = p\.id/);
  });

  it('compares in the ×1000 milliunit scale (qty units × 1000 vs minimum_balance_minor)', () => {
    expect(code).toMatch(/COALESCE\(s\.total_qty, 0\) \* 1000/);
    expect(code).toMatch(/p\.minimum_balance_minor/);
  });

  it('honours the tri-state: true → stock < minimum, false → stock ≥ minimum', () => {
    // The guard runs for BOTH branches (the `!== undefined` check, not a falsy
    // `if (filter.belowMinimum)` that drops `false`).
    expect(code).toMatch(/filter\.belowMinimum !== undefined/);
    // Both comparison operators are present (one per branch).
    expect(code).toMatch(/COALESCE\(s\.total_qty, 0\) \* 1000 < p\.minimum_balance_minor/);
    expect(code).toMatch(/COALESCE\(s\.total_qty, 0\) \* 1000 >= p\.minimum_balance_minor/);
  });

  it('still gates on a positive threshold (0 = disabled sentinel)', () => {
    expect(code).toMatch(/p\.minimum_balance_minor > 0/);
  });

  it('the dead-column query (`stock_minor < minimum_balance_minor`) is GONE', () => {
    // Non-vacuous: this exact comparison was the bug and must never return.
    expect(code).not.toMatch(/stock_minor < minimum_balance_minor/);
    expect(code).not.toMatch(/\bstock_minor\b/);
  });

  it('the falsy `if (filter.belowMinimum)` guard (which dropped the false branch) is GONE', () => {
    expect(code).not.toMatch(/if \(filter\.belowMinimum\)\s*\{/);
  });
});
