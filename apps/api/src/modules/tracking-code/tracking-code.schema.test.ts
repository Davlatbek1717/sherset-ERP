import { describe, expect, it } from 'vitest';
import {
  CreateTrackingCodeSchema,
  TrackingCodeFilterSchema,
  UpdateTrackingCodeSchema,
} from './tracking-code.schema.js';

describe('CreateTrackingCodeSchema', () => {
  it('accepts minimal payload with cis and type', () => {
    const r = CreateTrackingCodeSchema.safeParse({ cis: 'ABC123', type: 'SHOES' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('ACTIVE');
  });

  it('rejects empty cis', () => {
    expect(CreateTrackingCodeSchema.safeParse({ cis: '', type: 'TOBACCO' }).success).toBe(false);
  });

  it('rejects unknown type', () => {
    expect(CreateTrackingCodeSchema.safeParse({ cis: 'X', type: 'UNKNOWN' }).success).toBe(false);
  });

  it('accepts all valid types', () => {
    const types = ['SHOES', 'TOBACCO', 'MEDICINES', 'PERFUME', 'TIRES', 'DAIRY', 'WATER', 'BEER'];
    for (const type of types) {
      expect(CreateTrackingCodeSchema.safeParse({ cis: 'TEST', type }).success).toBe(true);
    }
  });

  it('accepts optional productId as uuid', () => {
    const r = CreateTrackingCodeSchema.safeParse({
      cis: 'CODE',
      type: 'DAIRY',
      productId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  it('rejects productId as non-uuid string', () => {
    expect(
      CreateTrackingCodeSchema.safeParse({ cis: 'CODE', type: 'DAIRY', productId: 'not-uuid' })
        .success,
    ).toBe(false);
  });
});

describe('UpdateTrackingCodeSchema', () => {
  it('accepts empty object (with required version token)', () => {
    expect(UpdateTrackingCodeSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts status change', () => {
    const r = UpdateTrackingCodeSchema.safeParse({ status: 'RETIRED', version: 1 });
    expect(r.success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(UpdateTrackingCodeSchema.safeParse({ status: 'INVALID' }).success).toBe(false);
  });

  it('accepts null cis1162 on update (edit form clears it via `|| null` — was a 400)', () => {
    // Regression: cis1162 was z.string().optional() and the edit form sends
    // `cis1162.trim() || null`, so clearing «КИЗ (1162)» sent null → 400. Now .nullish().
    expect(UpdateTrackingCodeSchema.safeParse({ version: 1, cis1162: null }).success).toBe(true);
  });
});

describe('TrackingCodeFilterSchema', () => {
  it('defaults to sortBy=createdAt desc', () => {
    const r = TrackingCodeFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sortBy).toBe('createdAt');
      expect(r.data.sortDir).toBe('desc');
    }
  });

  it('accepts filter by type', () => {
    const r = TrackingCodeFilterSchema.safeParse({ type: 'TOBACCO' });
    expect(r.success).toBe(true);
  });

  it('accepts filter by status', () => {
    const r = TrackingCodeFilterSchema.safeParse({ status: 'TRANSFERRED' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid type in filter', () => {
    expect(TrackingCodeFilterSchema.safeParse({ type: 'DRUGS' }).success).toBe(false);
  });

  it('defaults limit to 50 and coerces a string limit (cursor pagination)', () => {
    const def = TrackingCodeFilterSchema.safeParse({});
    expect(def.success).toBe(true);
    if (def.success) expect(def.data.limit).toBe(50);
    const coerced = TrackingCodeFilterSchema.safeParse({ limit: '100' });
    expect(coerced.success).toBe(true);
    if (coerced.success) expect(coerced.data.limit).toBe(100);
  });

  it('accepts a uuid cursor and rejects an out-of-range limit', () => {
    expect(
      TrackingCodeFilterSchema.safeParse({ cursor: '00000000-0000-0000-0000-000000000001' })
        .success,
    ).toBe(true);
    expect(TrackingCodeFilterSchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
    expect(TrackingCodeFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(TrackingCodeFilterSchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every tracking-code field-edit save must carry the `version` the form loaded
 * so the repository can reject a stale write with 409. The token is REQUIRED on
 * Update (so a forgetful caller can't silently bypass the lock) and ABSENT from
 * Create (a brand-new row has no prior version to conflict with).
 */
describe('UpdateTrackingCodeSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateTrackingCodeSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
    expect(UpdateTrackingCodeSchema.safeParse({ status: 'ACTIVE', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateTrackingCodeSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateTrackingCodeSchema.safeParse({ version: -1 }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateTrackingCodeSchema.safeParse({ cis: 'ABC123', type: 'SHOES' }).success).toBe(true);
  });
});
