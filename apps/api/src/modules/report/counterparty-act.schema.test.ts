import { describe, expect, it } from 'vitest';
import { CounterpartyActSchema } from './counterparty-act.schema.js';

const uuid = () => crypto.randomUUID();
const base = () => ({ organizationId: uuid(), counterpartyId: uuid() });

describe('CounterpartyActSchema', () => {
  it('requires organizationId + counterpartyId', () => {
    expect(CounterpartyActSchema.safeParse({}).success).toBe(false);
    expect(CounterpartyActSchema.safeParse({ organizationId: uuid() }).success).toBe(false);
    expect(CounterpartyActSchema.safeParse(base()).success).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(
      CounterpartyActSchema.safeParse({ organizationId: 'x', counterpartyId: uuid() }).success,
    ).toBe(false);
    expect(CounterpartyActSchema.safeParse({ ...base(), contractId: 'nope' }).success).toBe(false);
  });

  it('defaults currency to UZS and uppercases it', () => {
    const a = CounterpartyActSchema.safeParse(base());
    if (!a.success) throw a.error;
    expect(a.data.currency).toBe('UZS');
    const b = CounterpartyActSchema.safeParse({ ...base(), currency: 'usd' });
    if (!b.success) throw b.error;
    expect(b.data.currency).toBe('USD');
  });

  it('rejects non-3-char currency', () => {
    expect(CounterpartyActSchema.safeParse({ ...base(), currency: 'EURO' }).success).toBe(false);
    expect(CounterpartyActSchema.safeParse({ ...base(), currency: 'EU' }).success).toBe(false);
  });

  it('coerces date-only from/to and leaves them optional', () => {
    const none = CounterpartyActSchema.safeParse(base());
    if (!none.success) throw none.error;
    expect(none.data.from).toBeUndefined();
    expect(none.data.to).toBeUndefined();
    const r = CounterpartyActSchema.safeParse({ ...base(), from: '2026-06-01', to: '2026-06-28' });
    if (!r.success) throw r.error;
    expect(r.data.from).toBeInstanceOf(Date);
    expect(r.data.to).toBeInstanceOf(Date);
  });

  it('accepts an optional contractId', () => {
    expect(CounterpartyActSchema.safeParse({ ...base(), contractId: uuid() }).success).toBe(true);
  });
});
