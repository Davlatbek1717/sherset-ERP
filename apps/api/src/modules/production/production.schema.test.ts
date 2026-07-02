import { describe, expect, it } from 'vitest';
import {
  CreateProductionSchema,
  ProductionFilterSchema,
  ProductionStateSchema,
  ProductionTransitionSchema,
  UpdateProductionSchema,
} from './production.schema.js';

const orgId = '00000000-0000-0000-0000-000000000001';
const storeId = '00000000-0000-0000-0000-000000000002';

describe('ProductionStateSchema', () => {
  it.each(['draft', 'posted', 'cancelled'])('accepts %s', (s) => {
    expect(ProductionStateSchema.safeParse(s).success).toBe(true);
  });

  it('rejects unknown state', () => {
    expect(ProductionStateSchema.safeParse('done').success).toBe(false);
  });
});

describe('ProductionTransitionSchema', () => {
  it.each(['post', 'unpost', 'cancel'])('accepts %s', (t) => {
    expect(ProductionTransitionSchema.safeParse(t).success).toBe(true);
  });

  it('rejects unknown target', () => {
    expect(ProductionTransitionSchema.safeParse('approve').success).toBe(false);
  });
});

describe('CreateProductionSchema', () => {
  const base = { organizationId: orgId, storeId };

  it('accepts a minimal production', () => {
    const r = CreateProductionSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe('UZS');
      expect(r.data.vatEnabled).toBe(true);
    }
  });

  it('rejects missing organizationId', () => {
    expect(CreateProductionSchema.safeParse({ storeId }).success).toBe(false);
  });

  it('rejects missing storeId', () => {
    expect(CreateProductionSchema.safeParse({ organizationId: orgId }).success).toBe(false);
  });

  it('rejects invalid currency length', () => {
    expect(CreateProductionSchema.safeParse({ ...base, currency: 'USDOLLAR' }).success).toBe(false);
  });

  it('coerces vatEnabled boolean string', () => {
    const r = CreateProductionSchema.safeParse({ ...base, vatEnabled: 'false' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.vatEnabled).toBe(false);
  });

  it('accepts attributes record', () => {
    const r = CreateProductionSchema.safeParse({
      ...base,
      attributes: { batch_id: 'B-2026-001' },
    });
    expect(r.success).toBe(true);
  });

  it('defaults reserve to false (§85)', () => {
    const r = CreateProductionSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reserve).toBe(false);
  });

  it('defaults awaiting to false; coerces "true" string (§121)', () => {
    const def = CreateProductionSchema.safeParse(base);
    expect(def.success && def.data.awaiting).toBe(false);
    const on = CreateProductionSchema.safeParse({ ...base, awaiting: 'true' });
    expect(on.success && on.data.awaiting).toBe(true);
  });

  it('accepts the §85 production block (materialsStore/dates/reserve/project)', () => {
    const r = CreateProductionSchema.safeParse({
      ...base,
      materialsStoreId: '00000000-0000-0000-0000-0000000000a1',
      projectId: '00000000-0000-0000-0000-0000000000a2',
      productionStart: '2026-05-18T08:00:00.000Z',
      productionEnd: '2026-05-20T17:00:00.000Z',
      reserve: 'true',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.materialsStoreId).toBe('00000000-0000-0000-0000-0000000000a1');
      expect(r.data.projectId).toBe('00000000-0000-0000-0000-0000000000a2');
      expect(r.data.reserve).toBe(true);
    }
  });

  it('rejects a non-datetime productionStart', () => {
    expect(
      CreateProductionSchema.safeParse({ ...base, productionStart: 'not-a-date' }).success,
    ).toBe(false);
  });
});

describe('UpdateProductionSchema', () => {
  it('accepts partial update', () => {
    const r = UpdateProductionSchema.safeParse({ version: 1, description: 'updated' });
    expect(r.success).toBe(true);
  });

  it('accepts customer-order disconnect via null', () => {
    const r = UpdateProductionSchema.safeParse({ version: 1, customerOrderId: null });
    expect(r.success).toBe(true);
  });

  it('requires version (optimistic-lock token) on update', () => {
    expect(UpdateProductionSchema.safeParse({ description: 'x' }).success).toBe(false);
    expect(UpdateProductionSchema.safeParse({ version: '1' }).success).toBe(false);
  });
});

describe('ProductionFilterSchema', () => {
  it('uses default sortBy/sortDir', () => {
    const r = ProductionFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('moment');
      expect(r.data.sortDir).toBe('desc');
      expect(r.data.limit).toBe(50);
    }
  });

  it('coerces limit string', () => {
    const r = ProductionFilterSchema.safeParse({ limit: '25' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });

  it('rejects limit > 500', () => {
    expect(ProductionFilterSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });

  it('accepts state + organization filter', () => {
    const r = ProductionFilterSchema.safeParse({ state: 'posted', organizationId: orgId });
    expect(r.success).toBe(true);
  });
});
