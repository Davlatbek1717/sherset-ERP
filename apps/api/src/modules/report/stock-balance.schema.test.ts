import { describe, expect, it } from 'vitest';
import { StockBalanceFilterSchema } from './stock-balance.schema.js';

const uuid = () => crypto.randomUUID();

describe('StockBalanceFilterSchema', () => {
  it('accepts an empty payload (defaults applied)', () => {
    const r = StockBalanceFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('none');
    expect(r.data.limit).toBe(100);
  });

  it('accepts storeId + productId UUID filters', () => {
    const r = StockBalanceFilterSchema.safeParse({
      storeId: uuid(),
      productId: uuid(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed storeId', () => {
    expect(StockBalanceFilterSchema.safeParse({ storeId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts all assortmentKind values', () => {
    for (const kind of ['product', 'variant', 'bundle']) {
      const r = StockBalanceFilterSchema.safeParse({ assortmentKind: kind });
      expect(r.success, `kind=${kind}`).toBe(true);
    }
  });

  it('rejects unknown assortmentKind', () => {
    expect(StockBalanceFilterSchema.safeParse({ assortmentKind: 'service' }).success).toBe(false);
  });

  it('coerces hideEmpty from string', () => {
    const r = StockBalanceFilterSchema.safeParse({ hideEmpty: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.hideEmpty).toBe(true);
  });

  it('rejects unknown groupBy', () => {
    expect(StockBalanceFilterSchema.safeParse({ groupBy: 'store' }).success).toBe(false);
  });

  it('accepts groupBy=product', () => {
    const r = StockBalanceFilterSchema.safeParse({ groupBy: 'product' });
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('product');
  });

  it('coerces limit from string', () => {
    const r = StockBalanceFilterSchema.safeParse({ limit: '50' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('rejects limit > 500', () => {
    expect(StockBalanceFilterSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(StockBalanceFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects 101-char search', () => {
    expect(StockBalanceFilterSchema.safeParse({ search: 'a'.repeat(101) }).success).toBe(false);
  });
});
