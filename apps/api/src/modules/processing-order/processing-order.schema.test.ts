import { describe, expect, it } from 'vitest';
import {
  CreateProcessingOrderSchema,
  ProcessingOrderFilterSchema,
  ProcessingOrderStateSchema,
  ProcessingOrderTransitionSchema,
  UpdateProcessingOrderSchema,
} from './processing-order.schema.js';

describe('ProcessingOrderStateSchema', () => {
  it('accepts documented states', () => {
    for (const s of ['draft', 'posted', 'cancelled']) {
      expect(ProcessingOrderStateSchema.parse(s)).toBe(s);
    }
  });
});

describe('ProcessingOrderTransitionSchema', () => {
  it('accepts post/unpost/cancel', () => {
    for (const t of ['post', 'unpost', 'cancel']) {
      expect(ProcessingOrderTransitionSchema.parse(t)).toBe(t);
    }
  });
});

describe('CreateProcessingOrderSchema', () => {
  const valid = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    storeId: '00000000-0000-0000-0000-000000000002',
    quantity: '5',
  };

  it('parses minimal valid input', () => {
    const p = CreateProcessingOrderSchema.parse(valid);
    expect(p.storeId).toBe(valid.storeId);
    expect(p.quantity).toBe('5');
  });

  it('rejects non-positive quantity', () => {
    expect(() => CreateProcessingOrderSchema.parse({ ...valid, quantity: '0' })).toThrow();
  });
});

describe('ProcessingOrderFilterSchema', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = ProcessingOrderFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set (no agent/contract)', () => {
    const p = ProcessingOrderFilterSchema.parse({
      state: 'posted',
      organizationId: uuid,
      storeId: uuid,
      processingPlanId: uuid,
      productionId: uuid,
      projectId: uuid,
      ownerId: uuid,
      groupId: uuid,
    });
    expect(p.processingPlanId).toBe(uuid);
    expect(p.productionId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.ownerId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = ProcessingOrderFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = ProcessingOrderFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = ProcessingOrderFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts the sum range filter', () => {
    const p = ProcessingOrderFilterSchema.parse({
      sumMinorFrom: '100000',
      sumMinorTo: '500000',
    });
    expect(p.sumMinorFrom).toBe(100000);
    expect(p.sumMinorTo).toBe(500000);
  });

  it('accepts the moysklad-parity sortBy values incl. relational keys', () => {
    for (const k of [
      'moment',
      'name',
      'sumMinor',
      'deliveryPlannedMoment',
      'createdAt',
      'updatedAt',
      'organization',
      'store',
    ] as const) {
      const p = ProcessingOrderFilterSchema.parse({ sortBy: k });
      expect(p.sortBy).toBe(k);
    }
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => ProcessingOrderFilterSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
    expect(() => ProcessingOrderFilterSchema.parse({ groupId: 'nope' })).toThrow();
    expect(() => ProcessingOrderFilterSchema.parse({ ownerId: 'x' })).toThrow();
    expect(() => ProcessingOrderFilterSchema.parse({ productionId: 'no' })).toThrow();
    expect(() => ProcessingOrderFilterSchema.parse({ processingPlanId: 'no' })).toThrow();
  });
});

describe('UpdateProcessingOrderSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected)', () => {
    expect(UpdateProcessingOrderSchema.safeParse({}).success).toBe(false);
    expect(UpdateProcessingOrderSchema.safeParse({ version: 1 }).success).toBe(true);
  });
  it('rejects a non-integer / negative / string version', () => {
    expect(UpdateProcessingOrderSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateProcessingOrderSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateProcessingOrderSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});
