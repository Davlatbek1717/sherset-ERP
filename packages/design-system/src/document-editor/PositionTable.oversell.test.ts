import { describe, expect, it } from 'vitest';
import { type DocPositionRow, isRowOversold } from './PositionTable.tsx';

// Minimal row factory — only the fields isRowOversold reads matter.
const row = (over: Partial<DocPositionRow>): DocPositionRow => ({
  id: '1',
  productLabel: 'x',
  quantity: '0',
  priceMinor: '0',
  discount: '0',
  vat: '12',
  vatEnabled: true,
  ...over,
});

const STOCK_COLS = [{ key: 'quantity' }, { key: 'reserve' }, { key: 'stock' }];
const AVAIL_COLS = [{ key: 'quantity' }, { key: 'available' }, { key: 'stock' }];

describe('isRowOversold (moysklad sales-grid: Кол-во > displayed stock ⇒ red row)', () => {
  it('is TRUE when ordered qty exceeds the shown «Остаток» (the reported bug: 2 > 1, 8 > 6)', () => {
    expect(isRowOversold(row({ quantity: '2', stock: '1' }), STOCK_COLS)).toBe(true);
    expect(isRowOversold(row({ quantity: '8', stock: '6' }), STOCK_COLS)).toBe(true);
  });

  it('is TRUE when stock is 0 and any qty is ordered (the first screenshot: 11 > 0)', () => {
    expect(isRowOversold(row({ quantity: '11', stock: '0' }), STOCK_COLS)).toBe(true);
  });

  it('is FALSE when ordered qty fits within stock (1 ≤ 2)', () => {
    expect(isRowOversold(row({ quantity: '1', stock: '2' }), STOCK_COLS)).toBe(false);
    expect(isRowOversold(row({ quantity: '2', stock: '2' }), STOCK_COLS)).toBe(false);
  });

  it('prefers «Доступно» over «Остаток» when the available column is shown', () => {
    // available 1 < qty 2 ⇒ oversold, even though stock 5 would look fine.
    expect(isRowOversold(row({ quantity: '2', available: '1', stock: '5' }), AVAIL_COLS)).toBe(
      true,
    );
  });

  it('is FALSE with no stock column shown, or no stock number on the row', () => {
    expect(isRowOversold(row({ quantity: '99', stock: '0' }), [{ key: 'quantity' }])).toBe(false);
    expect(isRowOversold(row({ quantity: '99' }), STOCK_COLS)).toBe(false); // stock undefined
  });

  it('tolerates grouped / comma-decimal display strings («1 000», «1,5»)', () => {
    expect(isRowOversold(row({ quantity: '1 001', stock: '1 000' }), STOCK_COLS)).toBe(true);
    expect(isRowOversold(row({ quantity: '1,5', stock: '2' }), STOCK_COLS)).toBe(false);
  });
});
