import { describe, expect, it } from 'vitest';
import {
  CreateOnlineOrderSchema,
  ONLINE_ORDER_STATES,
  OnlineOrderFilterSchema,
  OnlineOrderStateSchema,
  RejectOnlineOrderSchema,
} from './online-order.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';

describe('ONLINE_ORDER_STATES', () => {
  it('has 4 states', () => {
    expect(ONLINE_ORDER_STATES).toHaveLength(4);
    expect(ONLINE_ORDER_STATES).toContain('pending');
    expect(ONLINE_ORDER_STATES).toContain('accepted');
    expect(ONLINE_ORDER_STATES).toContain('rejected');
    expect(ONLINE_ORDER_STATES).toContain('converted');
  });
});

describe('OnlineOrderStateSchema', () => {
  it('accepts all valid states', () => {
    for (const s of ONLINE_ORDER_STATES) {
      expect(OnlineOrderStateSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown state', () => {
    expect(() => OnlineOrderStateSchema.parse('open')).toThrow();
    expect(() => OnlineOrderStateSchema.parse('cancelled')).toThrow();
  });
});

describe('OnlineOrderFilterSchema', () => {
  it('defaults limit=50 and sortDir=desc', () => {
    const r = OnlineOrderFilterSchema.parse({});
    expect(r.limit).toBe(50);
    expect(r.sortDir).toBe('desc');
  });

  it('accepts channelId and state filters', () => {
    const r = OnlineOrderFilterSchema.parse({ channelId: UUID, state: 'pending' });
    expect(r.channelId).toBe(UUID);
    expect(r.state).toBe('pending');
  });

  it('rejects invalid channelId', () => {
    expect(() => OnlineOrderFilterSchema.parse({ channelId: 'not-uuid' })).toThrow();
  });

  it('rejects invalid state', () => {
    expect(() => OnlineOrderFilterSchema.parse({ state: 'open' })).toThrow();
  });

  it('coerces dateFrom and dateTo to Date', () => {
    const r = OnlineOrderFilterSchema.parse({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(r.dateFrom).toBeInstanceOf(Date);
    expect(r.dateTo).toBeInstanceOf(Date);
  });

  it('rejects limit above max (500)', () => {
    expect(() => OnlineOrderFilterSchema.parse({ limit: '501' })).toThrow();
  });

  it('rejects invalid cursor', () => {
    expect(() => OnlineOrderFilterSchema.parse({ cursor: 'bad' })).toThrow();
  });
});

describe('CreateOnlineOrderSchema', () => {
  const valid = {
    channelId: UUID,
    externalOrderId: 'ORD-001',
  };

  it('parses a minimal valid order', () => {
    const r = CreateOnlineOrderSchema.parse(valid);
    expect(r.channelId).toBe(UUID);
    expect(r.externalOrderId).toBe('ORD-001');
    expect(r.currency).toBe('UZS');
    expect(r.sumMinor).toBe(0n);
  });

  it('coerces sumMinor string to bigint', () => {
    const r = CreateOnlineOrderSchema.parse({ ...valid, sumMinor: '500000' });
    expect(r.sumMinor).toBe(500000n);
  });

  it('rejects negative sumMinor', () => {
    expect(() => CreateOnlineOrderSchema.parse({ ...valid, sumMinor: '-1' })).toThrow();
  });

  it('accepts customerName and phone', () => {
    const r = CreateOnlineOrderSchema.parse({
      ...valid,
      customerName: 'John',
      customerPhone: '+998901234567',
    });
    expect(r.customerName).toBe('John');
    expect(r.customerPhone).toBe('+998901234567');
  });

  it('rejects invalid channelId', () => {
    expect(() => CreateOnlineOrderSchema.parse({ ...valid, channelId: 'bad' })).toThrow();
  });

  it('rejects empty externalOrderId', () => {
    expect(() => CreateOnlineOrderSchema.parse({ ...valid, externalOrderId: '' })).toThrow();
  });

  it('accepts items as arbitrary JSON', () => {
    const items = [{ name: 'Product A', qty: 2, price: 50000 }];
    const r = CreateOnlineOrderSchema.parse({ ...valid, items });
    expect(r.items).toEqual(items);
  });

  it('defaults currency to UZS', () => {
    const r = CreateOnlineOrderSchema.parse(valid);
    expect(r.currency).toBe('UZS');
  });
});

describe('RejectOnlineOrderSchema', () => {
  it('allows empty body', () => {
    const r = RejectOnlineOrderSchema.parse({});
    expect(r.reason).toBeUndefined();
  });

  it('accepts a reason string', () => {
    const r = RejectOnlineOrderSchema.parse({ reason: 'Out of stock' });
    expect(r.reason).toBe('Out of stock');
  });

  it('rejects reason longer than 500 chars', () => {
    expect(() => RejectOnlineOrderSchema.parse({ reason: 'x'.repeat(501) })).toThrow();
  });
});
