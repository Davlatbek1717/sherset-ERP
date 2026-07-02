import { describe, expect, it } from 'vitest';
import {
  CreateFromSupplySchema,
  CreatePurchaseReturnSchema,
  PurchaseReturnFilterSchema,
  PurchaseReturnStateSchema,
  PurchaseReturnTransitionSchema,
  UpdatePurchaseReturnSchema,
} from './purchase-return.schema.js';

describe('PurchaseReturnStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(PurchaseReturnStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('PurchaseReturnTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    expect(PurchaseReturnTransitionSchema.parse('post')).toBe('post');
    expect(PurchaseReturnTransitionSchema.parse('unpost')).toBe('unpost');
    expect(PurchaseReturnTransitionSchema.parse('cancel')).toBe('cancel');
  });
});

describe('CreatePurchaseReturnSchema', () => {
  const valid = {
    agentId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    storeId: '00000000-0000-0000-0000-000000000003',
    positions: [
      {
        assortmentKind: 'product',
        assortmentId: '00000000-0000-0000-0000-000000000099',
        quantity: '2',
        priceMinor: '5000000',
      },
    ],
  };

  it('parses minimal valid input', () => {
    const parsed = CreatePurchaseReturnSchema.parse(valid);
    expect(parsed.currency).toBe('UZS');
  });

  it('requires ≥1 position', () => {
    expect(() => CreatePurchaseReturnSchema.parse({ ...valid, positions: [] })).toThrow(
      /at least one/i,
    );
  });

  it('accepts supplyId back-link', () => {
    const parsed = CreatePurchaseReturnSchema.parse({
      ...valid,
      supplyId: '00000000-0000-0000-0000-000000000020',
    });
    expect(parsed.supplyId).toBe('00000000-0000-0000-0000-000000000020');
  });

  it('accepts supplyPositionId per position', () => {
    const parsed = CreatePurchaseReturnSchema.parse({
      ...valid,
      positions: [
        {
          ...valid.positions[0],
          supplyPositionId: '00000000-0000-0000-0000-000000000030',
        },
      ],
    });
    expect(parsed.positions[0].supplyPositionId).toBe('00000000-0000-0000-0000-000000000030');
  });
});

describe('CreateFromSupplySchema', () => {
  it('parses empty body', () => {
    const parsed = CreateFromSupplySchema.parse({});
    expect(parsed.storeId).toBeUndefined();
  });
  it('accepts quantities override + reason', () => {
    const parsed = CreateFromSupplySchema.parse({
      quantities: { '00000000-0000-0000-0000-000000000001': '3' },
      reason: 'Sifat yomon',
    });
    expect(parsed.quantities?.['00000000-0000-0000-0000-000000000001']).toBe('3');
    expect(parsed.reason).toBe('Sifat yomon');
  });
});

describe('PurchaseReturnFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = PurchaseReturnFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('accepts supplyId («Приемка») filter', () => {
    const p = PurchaseReturnFilterSchema.parse({
      supplyId: '00000000-0000-0000-0000-000000000007',
    });
    expect(p.supplyId).toBe('00000000-0000-0000-0000-000000000007');
  });

  it('parses the full moysklad-parity filter field set', () => {
    const p = PurchaseReturnFilterSchema.parse({
      state: 'posted',
      agentId: uuid,
      agentGroupId: uuid,
      agentAccountId: uuid,
      organizationId: uuid,
      organizationAccountId: uuid,
      storeId: uuid,
      supplyId: uuid,
      contractId: uuid,
      projectId: uuid,
      groupId: uuid,
      ownerId: uuid,
    });
    expect(p.agentGroupId).toBe(uuid);
    expect(p.agentAccountId).toBe(uuid);
    expect(p.organizationAccountId).toBe(uuid);
    expect(p.storeId).toBe(uuid);
    expect(p.supplyId).toBe(uuid);
    expect(p.contractId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = PurchaseReturnFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = PurchaseReturnFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = PurchaseReturnFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts agent + organization relational sort keys', () => {
    expect(PurchaseReturnFilterSchema.parse({ sortBy: 'agent' }).sortBy).toBe('agent');
    expect(PurchaseReturnFilterSchema.parse({ sortBy: 'organization' }).sortBy).toBe(
      'organization',
    );
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => PurchaseReturnFilterSchema.parse({ agentGroupId: 'not-a-uuid' })).toThrow();
    expect(() => PurchaseReturnFilterSchema.parse({ contractId: 'nope' })).toThrow();
  });
});

describe('UpdatePurchaseReturnSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdatePurchaseReturnSchema.safeParse({}).success).toBe(false);
    expect(UpdatePurchaseReturnSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePurchaseReturnSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdatePurchaseReturnSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdatePurchaseReturnSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
