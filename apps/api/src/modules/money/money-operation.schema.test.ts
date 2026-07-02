import { describe, expect, it } from 'vitest';
import { MoneyOperationFilterSchema } from './money-operation.schema.js';

const uuid = () => crypto.randomUUID();

describe('MoneyOperationFilterSchema', () => {
  it('defaults flow=all and limit=25 when nothing is supplied', () => {
    const r = MoneyOperationFilterSchema.parse({});
    expect(r.flow).toBe('all');
    expect(r.limit).toBe(25);
  });

  it('accepts each documentKind enum value (the de-facto writer slugs)', () => {
    for (const kind of ['cash_in', 'cash_out', 'retailsale'] as const) {
      const r = MoneyOperationFilterSchema.parse({ documentKind: kind });
      expect(r.documentKind).toBe(kind);
    }
  });

  it('rejects an unknown documentKind', () => {
    expect(() => MoneyOperationFilterSchema.parse({ documentKind: 'foo' })).toThrow();
    // the pre-2026-06-11 aspirational slugs no writer ever produced —
    // accepting them would silently filter to an empty list again
    expect(() => MoneyOperationFilterSchema.parse({ documentKind: 'cashin' })).toThrow();
    expect(() => MoneyOperationFilterSchema.parse({ documentKind: 'paymentin' })).toThrow();
  });

  it('coerces a string limit to a number', () => {
    const r = MoneyOperationFilterSchema.parse({ limit: '50' });
    expect(r.limit).toBe(50);
  });

  it('clamps the limit at 250', () => {
    expect(() => MoneyOperationFilterSchema.parse({ limit: 251 })).toThrow();
  });

  it('rejects non-uuid filter ids', () => {
    expect(() => MoneyOperationFilterSchema.parse({ organizationAccountId: 'not-uuid' })).toThrow();
    expect(() => MoneyOperationFilterSchema.parse({ cashDeskId: 'nope' })).toThrow();
    expect(() => MoneyOperationFilterSchema.parse({ counterpartyId: '' })).toThrow();
  });

  it('accepts iso date strings for fromDate / toDate', () => {
    const r = MoneyOperationFilterSchema.parse({
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(r.fromDate).toBe('2026-01-01');
    expect(r.toDate).toBe('2026-12-31');
  });

  it('requires currency to be exactly 3 chars', () => {
    expect(() => MoneyOperationFilterSchema.parse({ currency: 'UZ' })).toThrow();
    expect(() => MoneyOperationFilterSchema.parse({ currency: 'USDX' })).toThrow();
    const r = MoneyOperationFilterSchema.parse({ currency: 'UZS' });
    expect(r.currency).toBe('UZS');
  });

  it('accepts flow=in / flow=out narrowing', () => {
    expect(MoneyOperationFilterSchema.parse({ flow: 'in' }).flow).toBe('in');
    expect(MoneyOperationFilterSchema.parse({ flow: 'out' }).flow).toBe('out');
  });

  it('accepts cursor as a uuid', () => {
    const id = uuid();
    expect(MoneyOperationFilterSchema.parse({ cursor: id }).cursor).toBe(id);
  });
});
