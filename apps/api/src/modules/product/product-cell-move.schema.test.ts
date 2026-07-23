import { describe, expect, it } from 'vitest';
import { CellMoveSchema } from './product-cell-move.schema.js';

/**
 * «Переместить по ячейкам» request guards — the cheap, stable half of the
 * feature's safety (the qty-sufficiency + tenant/cell guards live in the service
 * and are covered by browser-verify). These lock the shape: distinct cells and a
 * strictly-positive ≤6dp decimal quantity.
 */
const base = {
  storeId: '11111111-1111-1111-1111-111111111111',
  fromCellId: '22222222-2222-2222-2222-222222222222',
  toCellId: '33333333-3333-3333-3333-333333333333',
  qty: '5',
};

describe('CellMoveSchema', () => {
  it('accepts a valid move', () => {
    expect(CellMoveSchema.parse(base)).toMatchObject({ qty: '5', fromCellId: base.fromCellId });
  });

  it('accepts a fractional qty up to 6 decimal places', () => {
    expect(CellMoveSchema.parse({ ...base, qty: '2.5' }).qty).toBe('2.5');
    expect(CellMoveSchema.parse({ ...base, qty: '0.000001' }).qty).toBe('0.000001');
  });

  it('rejects moving a cell onto itself (from === to)', () => {
    expect(() => CellMoveSchema.parse({ ...base, toCellId: base.fromCellId })).toThrow();
  });

  it('rejects zero / negative / non-decimal / over-precision qty', () => {
    for (const qty of ['0', '-1', '', ' ', 'abc', '1.1234567', '1,5']) {
      expect(() => CellMoveSchema.parse({ ...base, qty })).toThrow();
    }
  });

  it('rejects a non-uuid cell or store id', () => {
    expect(() => CellMoveSchema.parse({ ...base, toCellId: 'not-a-uuid' })).toThrow();
    expect(() => CellMoveSchema.parse({ ...base, storeId: '42' })).toThrow();
  });
});
