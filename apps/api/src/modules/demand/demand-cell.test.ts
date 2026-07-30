import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemandPositionInputSchema } from './demand.schema.js';

/**
 * «Ячейка» on Отгрузка positions (2026-07-30) — moysklad 1:1 gap C1.
 *
 * Demand is an OUTBOUND document: the goods leave a specific address-storage
 * bin, so `cellId` must reach `StockDelta` or per-cell stock (StockByCell) silently
 * drifts from the store total. Mirrors purchase-return, the other outbound doc.
 *
 * Non-vacuity (measured 2026-07-30, not asserted): `git show HEAD:demand.service.ts`
 * contains ZERO occurrences of `cellId: p.cellId ?? null` and zero of
 * `assertCellsInStore`; the post-change file has 5 and 2 respectively. Every
 * source-scan below therefore fails on the pre-change file.
 */

const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');

const UUID = '11111111-1111-4111-8111-111111111111';
const basePosition = {
  assortmentId: UUID,
  quantity: '2',
  priceMinor: '150000',
};

describe('DemandPositionInputSchema accepts the «Ячейка» bin', () => {
  it('parses a picked bin (id + denormalized label)', () => {
    const parsed = DemandPositionInputSchema.parse({
      ...basePosition,
      cellId: UUID,
      cell: '01-02-03-04',
    });
    expect(parsed.cellId).toBe(UUID);
    expect(parsed.cell).toBe('01-02-03-04');
  });

  it('treats the bin as optional — a demand without address storage still parses', () => {
    const parsed = DemandPositionInputSchema.parse(basePosition);
    expect(parsed.cellId ?? null).toBeNull();
  });

  it('accepts an explicit null (clearing the bin on edit)', () => {
    const parsed = DemandPositionInputSchema.parse({ ...basePosition, cellId: null, cell: null });
    expect(parsed.cellId).toBeNull();
  });

  it('rejects a non-uuid cellId instead of coercing it', () => {
    expect(() =>
      DemandPositionInputSchema.parse({ ...basePosition, cellId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects a label longer than the column (255) rather than truncating', () => {
    expect(() =>
      DemandPositionInputSchema.parse({ ...basePosition, cell: 'x'.repeat(256) }),
    ).toThrow();
  });
});

describe('the bin reaches the stock ledger on every transition', () => {
  // post / unpost / cancel each build a StockDelta[]; all three must carry the
  // bin, else posting deducts from a cell but unposting returns to the store's
  // implicit bin — per-cell stock would drift permanently.
  it('all three StockDelta builders pass cellId', () => {
    const deltaSites = SERVICE.match(/cellId: p\.cellId \?\? null,\s*\n\s*qtyDelta/g) ?? [];
    expect(deltaSites).toHaveLength(3);
  });

  it('unpost and cancel reverse into the SAME bin (zero-sum)', () => {
    // Both reversal deltas sit directly above their qtyDelta with no negation.
    for (const docType of ['demand_unpost', 'demand_cancel']) {
      const re = new RegExp(
        `cellId: p\\.cellId \\?\\? null,\\s*\\n\\s*qtyDelta: String\\(p\\.quantity\\),[\\s\\S]{0,120}?docType: '${docType}'`,
      );
      expect(SERVICE).toMatch(re);
    }
  });
});

describe('a picked bin is validated against the document store', () => {
  it('create() and update() both call assertCellsInStore', () => {
    const calls = SERVICE.match(/assertCellsInStore\(/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it('update() validates against the NEW store when the store changes', () => {
    expect(SERVICE).toMatch(/parsed\.storeId \?\? existing\.storeId/);
  });

  it('clone() copies the source bin so the copy stays addressable', () => {
    expect(SERVICE).toMatch(/cellId: p\.cellId,\s*\n\s*cell: p\.cell,/);
  });
});
