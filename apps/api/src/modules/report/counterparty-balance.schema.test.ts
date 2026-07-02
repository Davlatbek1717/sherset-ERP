import { describe, expect, it } from 'vitest';
import { CounterpartyBalanceFilterSchema } from './counterparty-balance.schema.js';

const uuid = () => crypto.randomUUID();

describe('CounterpartyBalanceFilterSchema', () => {
  it('accepts an empty payload (defaults applied)', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.signFilter).toBe('nonzero');
    expect(r.data.groupBy).toBe('none');
    expect(r.data.limit).toBe(200);
  });

  it('accepts UUID filters', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({ counterpartyId: uuid() });
    expect(r.success).toBe(true);
  });

  it('rejects malformed counterpartyId', () => {
    expect(
      CounterpartyBalanceFilterSchema.safeParse({ counterpartyId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('uppercases currency code', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({ currency: 'usd' });
    if (!r.success) throw r.error;
    expect(r.data.currency).toBe('USD');
  });

  it('rejects 4-char currency', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ currency: 'EURO' }).success).toBe(false);
  });

  it('rejects 2-char currency', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ currency: 'EU' }).success).toBe(false);
  });

  it('accepts all signFilter values', () => {
    for (const sign of ['all', 'nonzero', 'debtors', 'creditors']) {
      const r = CounterpartyBalanceFilterSchema.safeParse({ signFilter: sign });
      expect(r.success, `sign=${sign}`).toBe(true);
    }
  });

  it('rejects unknown signFilter', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ signFilter: 'positive' }).success).toBe(
      false,
    );
  });

  it('coerces includeArchived from string', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({ includeArchived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.includeArchived).toBe(true);
  });

  it('rejects unknown groupBy', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ groupBy: 'currency' }).success).toBe(false);
  });

  it('accepts groupBy=counterparty', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({ groupBy: 'counterparty' });
    if (!r.success) throw r.error;
    expect(r.data.groupBy).toBe('counterparty');
  });

  it('coerces limit from string', () => {
    const r = CounterpartyBalanceFilterSchema.safeParse({ limit: '50' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('rejects limit > 500', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });

  it('rejects 101-char search', () => {
    expect(CounterpartyBalanceFilterSchema.safeParse({ search: 'a'.repeat(101) }).success).toBe(
      false,
    );
  });
});
