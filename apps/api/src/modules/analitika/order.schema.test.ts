import { describe, expect, it } from 'vitest';
import { CreateOrderSchema, OrderFilterSchema } from './order.schema.js';

const PID = '11111111-1111-1111-1111-111111111111';

describe('CreateOrderSchema', () => {
  it('accepts one line without a counterparty', () => {
    const r = CreateOrderSchema.safeParse({ lines: [{ productId: PID, qty: 2 }] });
    expect(r.success).toBe(true);
  });

  it('accepts a counterparty + multiple lines', () => {
    const r = CreateOrderSchema.safeParse({
      counterpartyId: '22222222-2222-2222-2222-222222222222',
      lines: [
        { productId: PID, qty: 1 },
        { productId: '33333333-3333-3333-3333-333333333333', qty: 5.5 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty line list', () => {
    expect(CreateOrderSchema.safeParse({ lines: [] }).success).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    expect(CreateOrderSchema.safeParse({ lines: [{ productId: PID, qty: 0 }] }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid product id', () => {
    expect(CreateOrderSchema.safeParse({ lines: [{ productId: 'x', qty: 1 }] }).success).toBe(
      false,
    );
  });
});

describe('OrderFilterSchema', () => {
  it('defaults to no filters', () => {
    const r = OrderFilterSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a state filter', () => {
    const r = OrderFilterSchema.safeParse({ state: 'formed' });
    if (!r.success) throw r.error;
    expect(r.data.state).toBe('formed');
  });

  it('rejects an invalid state', () => {
    expect(OrderFilterSchema.safeParse({ state: 'shipped' }).success).toBe(false);
  });
});
