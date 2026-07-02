import { describe, expect, it } from 'vitest';
import {
  CreatePurchaseOrderSchema,
  PurchaseOrderFilterSchema,
  PurchaseOrderStateSchema,
  PurchaseOrderTransitionSchema,
  UpdatePurchaseOrderSchema,
} from './purchase-order.schema.js';

describe('PurchaseOrderStateSchema', () => {
  it('accepts all documented states', () => {
    for (const s of [
      'draft',
      'sent',
      'confirmed',
      'partially_received',
      'fully_received',
      'closed',
      'cancelled',
    ]) {
      expect(PurchaseOrderStateSchema.parse(s)).toBe(s);
    }
  });
  it('rejects unknown state', () => {
    expect(() => PurchaseOrderStateSchema.parse('posted')).toThrow();
  });
});

describe('PurchaseOrderTransitionSchema', () => {
  it('accepts confirm/unconfirm/cancel (Sprint 4.1 manual scope)', () => {
    expect(PurchaseOrderTransitionSchema.parse('confirm')).toBe('confirm');
    expect(PurchaseOrderTransitionSchema.parse('unconfirm')).toBe('unconfirm');
    expect(PurchaseOrderTransitionSchema.parse('cancel')).toBe('cancel');
  });
  it('rejects Sales transitions (namespace separation)', () => {
    expect(() => PurchaseOrderTransitionSchema.parse('confirmed')).toThrow();
    expect(() => PurchaseOrderTransitionSchema.parse('post')).toThrow();
  });
});

describe('CreatePurchaseOrderSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    storeId: '00000000-0000-0000-0000-000000000003',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '10',
        priceMinor: '5000000',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const parsed = CreatePurchaseOrderSchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
    expect(parsed.vatEnabled).toBe(true);
    expect(parsed.vatIncluded).toBe(false);
  });

  it('requires at least one position', () => {
    expect(() => CreatePurchaseOrderSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one position/i,
    );
  });

  it('accepts optional deliveryPlannedMoment', () => {
    const parsed = CreatePurchaseOrderSchema.parse({
      ...valid,
      deliveryPlannedMoment: '2026-05-01T00:00:00Z',
    });
    expect(parsed.deliveryPlannedMoment).toBeInstanceOf(Date);
  });

  it('rejects fractional priceMinor (tiyin is integer)', () => {
    expect(() =>
      CreatePurchaseOrderSchema.parse({
        ...valid,
        positions: [{ ...valid.positions[0], priceMinor: '100.5' }],
      }),
    ).toThrow();
  });

  it('accepts fractional quantity (e.g. 0.5 kg)', () => {
    const parsed = CreatePurchaseOrderSchema.parse({
      ...valid,
      positions: [{ ...valid.positions[0], quantity: '0.5' }],
    });
    expect(parsed.positions[0].quantity).toBe('0.5');
  });
});

describe('PurchaseOrderFilterSchema', () => {
  it('applies defaults', () => {
    const p = PurchaseOrderFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });
  it('coerces applicable from string', () => {
    const p = PurchaseOrderFilterSchema.parse({ applicable: 'true' });
    expect(p.applicable).toBe(true);
  });
});

describe('UpdatePurchaseOrderSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdatePurchaseOrderSchema.safeParse({}).success).toBe(false);
    expect(UpdatePurchaseOrderSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePurchaseOrderSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdatePurchaseOrderSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdatePurchaseOrderSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
