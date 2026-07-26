import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Per-cell stock (StockByCell / Адресное хранение Phase 4) — centralisation +
 * null-cell-skip guards. These lock the design that makes per-cell stock automatic
 * for EVERY document via the single applyDeltas primitive, with zero regression for
 * the 99% no-cell case.
 */
const STOCK = readFileSync(join(__dirname, 'stock.service.ts'), 'utf8');

describe('StockByCell is driven centrally from applyDeltas (one insertion point)', () => {
  it('StockDelta carries an optional cellId', () => {
    expect(STOCK).toMatch(/cellId\?:\s*string\s*\|\s*null/);
  });

  it('the ledger row records the cellId', () => {
    expect(STOCK).toMatch(/cellId:\s*d\.cellId\s*\?\?\s*null/);
  });

  it('null-cell INBOUND deltas skip per-cell placement (can’t auto-assign an inflow to a cell)', () => {
    // Positive/zero delta with no cellId ⇒ store-level only (no phantom row).
    expect(STOCK).toMatch(/if\s*\(micro\s*>=\s*0n\)\s*continue;/);
  });

  it('null-cell OUTBOUND deltas AUTO-DEDUCT from the sku’s occupied cells (no phantom occupancy)', () => {
    // Sales/Move-out/Inventory-shortage carry no cellId; without this the cells
    // would only ever be incremented → StockByCell drifts above the store total.
    expect(STOCK).toMatch(/tx\.stockByCell\.findMany/);
    expect(STOCK).toMatch(/orderBy:\s*\{\s*qty:\s*'desc'\s*\}/);
    expect(STOCK).toMatch(/decrement:\s*fromMicro\(take\)/);
  });

  it('applies the per-cell qty by incrementing StockByCell (mirrors the Stock upsert)', () => {
    expect(STOCK).toMatch(/tx\.stockByCell\.upsert/);
    expect(STOCK).toMatch(/qty:\s*\{\s*increment:\s*d\.qtyDelta as Prisma\.Decimal\s*\}/);
  });

  it('exposes the «С этим товаром» + «Свободна/Занята» + cross-store-guard helpers', () => {
    expect(STOCK).toMatch(/getCellsHoldingProduct\(/);
    expect(STOCK).toMatch(/getOccupiedCellIds\(/);
    expect(STOCK).toMatch(/assertCellsInStore\(/);
  });
});
