import { describe, expect, it } from 'vitest';
import {
  BulkApproveSchema,
  CountFilterSchema,
  ReviewActionSchema,
  UpsertCountSchema,
} from './count.schema.js';

const PID = '11111111-1111-1111-1111-111111111111';
const SID = '22222222-2222-2222-2222-222222222222';

describe('UpsertCountSchema', () => {
  it('accepts a shortage (kam only)', () => {
    const r = UpsertCountSchema.safeParse({ productId: PID, storeId: SID, kamQty: 3, kopQty: 0 });
    expect(r.success).toBe(true);
  });

  it('accepts a surplus (kop only)', () => {
    const r = UpsertCountSchema.safeParse({ productId: PID, storeId: SID, kamQty: 0, kopQty: 4 });
    expect(r.success).toBe(true);
  });

  it('accepts both zero (clears the count)', () => {
    const r = UpsertCountSchema.safeParse({ productId: PID, storeId: SID, kamQty: 0, kopQty: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects both kam and kop non-zero (mutually exclusive)', () => {
    const r = UpsertCountSchema.safeParse({ productId: PID, storeId: SID, kamQty: 2, kopQty: 5 });
    expect(r.success).toBe(false);
  });

  it('rejects negative quantities', () => {
    expect(
      UpsertCountSchema.safeParse({ productId: PID, storeId: SID, kamQty: -1, kopQty: 0 }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid productId', () => {
    expect(
      UpsertCountSchema.safeParse({ productId: 'nope', storeId: SID, kamQty: 1, kopQty: 0 })
        .success,
    ).toBe(false);
  });

  it('defaults kam/kop to 0 when omitted', () => {
    const r = UpsertCountSchema.safeParse({ productId: PID, storeId: SID });
    if (!r.success) throw r.error;
    expect(r.data.kamQty).toBe(0);
    expect(r.data.kopQty).toBe(0);
  });
});

describe('CountFilterSchema', () => {
  it('defaults status to undefined (all)', () => {
    const r = CountFilterSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a status filter', () => {
    const r = CountFilterSchema.safeParse({ status: 'yellow' });
    if (!r.success) throw r.error;
    expect(r.data.status).toBe('yellow');
  });

  it('rejects an invalid status', () => {
    expect(CountFilterSchema.safeParse({ status: 'purple' }).success).toBe(false);
  });

  it('accepts a view filter', () => {
    const r = CountFilterSchema.safeParse({ view: 'pending' });
    if (!r.success) throw r.error;
    expect(r.data.view).toBe('pending');
  });

  it('rejects an invalid view', () => {
    expect(CountFilterSchema.safeParse({ view: 'archived' }).success).toBe(false);
  });
});

describe('ReviewActionSchema', () => {
  it('accepts an empty object (reason + note optional)', () => {
    expect(ReviewActionSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a reason code uuid + note', () => {
    const r = ReviewActionSchema.safeParse({
      reasonCodeId: '33333333-3333-3333-3333-333333333333',
      note: 'tekshirildi',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-uuid reason code', () => {
    expect(ReviewActionSchema.safeParse({ reasonCodeId: 'nope' }).success).toBe(false);
  });
});

describe('BulkApproveSchema', () => {
  it('accepts a non-empty id list', () => {
    const r = BulkApproveSchema.safeParse({ ids: ['33333333-3333-3333-3333-333333333333'] });
    expect(r.success).toBe(true);
  });

  it('rejects an empty id list', () => {
    expect(BulkApproveSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});
