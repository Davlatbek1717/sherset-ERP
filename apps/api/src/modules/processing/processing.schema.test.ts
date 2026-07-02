import { describe, expect, it } from 'vitest';
import {
  CreateProcessingSchema,
  CreateProcessingSchemaChecked,
  ProcessingFilterSchema,
  ProcessingStateSchema,
  ProcessingTransitionSchema,
  UpdateProcessingSchema,
} from './processing.schema.js';

const base = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  materialsStoreId: '00000000-0000-0000-0000-000000000002',
  productsStoreId: '00000000-0000-0000-0000-000000000003',
  processingPlanId: '00000000-0000-0000-0000-000000000004',
};

describe('ProcessingStateSchema / TransitionSchema', () => {
  it.each(['draft', 'posted', 'cancelled'])('state accepts %s', (s) => {
    expect(ProcessingStateSchema.safeParse(s).success).toBe(true);
  });
  it.each(['post', 'unpost', 'cancel'])('transition accepts %s', (t) => {
    expect(ProcessingTransitionSchema.safeParse(t).success).toBe(true);
  });
});

describe('CreateProcessingSchema (§85 organizationAccount)', () => {
  it('accepts a minimal processing (organizationAccountId optional)', () => {
    const r = CreateProcessingSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.organizationAccountId).toBeUndefined();
  });

  it('accepts a valid organizationAccountId (§85)', () => {
    const r = CreateProcessingSchema.safeParse({
      ...base,
      organizationAccountId: '00000000-0000-0000-0000-0000000000b1',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.organizationAccountId).toBe('00000000-0000-0000-0000-0000000000b1');
    }
  });

  it('rejects a non-uuid organizationAccountId', () => {
    expect(
      CreateProcessingSchema.safeParse({ ...base, organizationAccountId: 'ACC' }).success,
    ).toBe(false);
  });

  it('UpdateProcessingSchema accepts organizationAccountId', () => {
    const r = UpdateProcessingSchema.safeParse({
      version: 1,
      organizationAccountId: '00000000-0000-0000-0000-0000000000b2',
    });
    expect(r.success).toBe(true);
  });

  it('UpdateProcessingSchema requires version (optimistic-lock token)', () => {
    expect(
      UpdateProcessingSchema.safeParse({
        organizationAccountId: '00000000-0000-0000-0000-0000000000b2',
      }).success,
    ).toBe(false);
  });
});

describe('CreateProcessingSchemaChecked — §90 source rule', () => {
  const noPlan = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    materialsStoreId: '00000000-0000-0000-0000-000000000002',
    productsStoreId: '00000000-0000-0000-0000-000000000003',
  };
  const mat = [{ productId: '00000000-0000-0000-0000-0000000000a1', qty: '2' }];
  const prod = [{ productId: '00000000-0000-0000-0000-0000000000b1', qty: '1' }];

  it('plan-only is valid (unchanged v1)', () => {
    expect(CreateProcessingSchemaChecked.safeParse(base).success).toBe(true);
  });

  it('no plan + neither list ⇒ rejected', () => {
    expect(CreateProcessingSchemaChecked.safeParse(noPlan).success).toBe(false);
  });

  it('no plan + materials only ⇒ rejected (no output source)', () => {
    expect(CreateProcessingSchemaChecked.safeParse({ ...noPlan, materials: mat }).success).toBe(
      false,
    );
  });

  it('no plan + products only ⇒ rejected (no material source)', () => {
    expect(CreateProcessingSchemaChecked.safeParse({ ...noPlan, products: prod }).success).toBe(
      false,
    );
  });

  it('no plan + BOTH explicit lists ⇒ valid (fully self-described op)', () => {
    const r = CreateProcessingSchemaChecked.safeParse({
      ...noPlan,
      materials: mat,
      products: prod,
    });
    expect(r.success).toBe(true);
  });

  it('plan + explicit overrides ⇒ valid', () => {
    expect(
      CreateProcessingSchemaChecked.safeParse({ ...base, materials: mat, products: prod }).success,
    ).toBe(true);
  });
});

describe('ProcessingFilterSchema — moysklad parity panel', () => {
  const uuid = '00000000-0000-0000-0000-000000000001';

  it('applies defaults', () => {
    const p = ProcessingFilterSchema.parse({});
    expect(p.limit).toBe(50);
    expect(p.sortBy).toBe('moment');
    expect(p.sortDir).toBe('desc');
  });

  it('parses the full moysklad-parity filter field set (no agent/contract)', () => {
    const p = ProcessingFilterSchema.parse({
      state: 'posted',
      organizationId: uuid,
      materialsStoreId: uuid,
      productsStoreId: uuid,
      processingPlanId: uuid,
      processingOrderId: uuid,
      projectId: uuid,
      ownerId: uuid,
      groupId: uuid,
    });
    expect(p.processingPlanId).toBe(uuid);
    expect(p.processingOrderId).toBe(uuid);
    expect(p.projectId).toBe(uuid);
    expect(p.ownerId).toBe(uuid);
    expect(p.groupId).toBe(uuid);
    expect(p.materialsStoreId).toBe(uuid);
    expect(p.productsStoreId).toBe(uuid);
  });

  it('coerces the tri-state boolean flags from query strings', () => {
    const p = ProcessingFilterSchema.parse({
      applicable: 'true',
      printed: 'false',
      published: 'true',
    });
    expect(p.applicable).toBe(true);
    expect(p.printed).toBe(false);
    expect(p.published).toBe(true);
  });

  it('leaves the boolean flags undefined when absent (no false-positive filter)', () => {
    const p = ProcessingFilterSchema.parse({});
    expect(p.applicable).toBeUndefined();
    expect(p.printed).toBeUndefined();
    expect(p.published).toBeUndefined();
  });

  it('accepts the «Когда изменен» updated period range', () => {
    const p = ProcessingFilterSchema.parse({
      updatedFrom: '2026-01-01',
      updatedTo: '2026-01-31',
    });
    expect(p.updatedFrom).toBe('2026-01-01');
    expect(p.updatedTo).toBe('2026-01-31');
  });

  it('accepts the sum (costSumMinor) range filter', () => {
    const p = ProcessingFilterSchema.parse({
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
      'costSumMinor',
      'createdAt',
      'updatedAt',
      'organization',
      'materialsStore',
      'productsStore',
    ] as const) {
      const p = ProcessingFilterSchema.parse({ sortBy: k });
      expect(p.sortBy).toBe(k);
    }
  });

  it('rejects a non-uuid FK filter', () => {
    expect(() => ProcessingFilterSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
    expect(() => ProcessingFilterSchema.parse({ groupId: 'nope' })).toThrow();
    expect(() => ProcessingFilterSchema.parse({ ownerId: 'x' })).toThrow();
    expect(() => ProcessingFilterSchema.parse({ processingPlanId: 'no' })).toThrow();
    expect(() => ProcessingFilterSchema.parse({ processingOrderId: 'no' })).toThrow();
  });
});
