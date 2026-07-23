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

  it('null-cell deltas SKIP the per-cell upsert (no phantom rows, store-level unchanged)', () => {
    // Non-vacuous: removing this guard would attempt a StockByCell write with a null
    // PK component for every store-level delta.
    expect(STOCK).toMatch(/if\s*\(!d\.cellId\)\s*continue;/);
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
