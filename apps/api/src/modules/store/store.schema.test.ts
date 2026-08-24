import { describe, expect, it } from 'vitest';
import {
  BulkMoveSchema,
  BulkUpdateSchema,
  CreateStoreSchema,
  StoreAddressFullSchema,
  StoreFilterSchema,
  UpdateStoreSchema,
} from './store.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';

describe('CreateStoreSchema', () => {
  it('accepts a minimal store', () => {
    const r = CreateStoreSchema.safeParse({ name: 'Main warehouse' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.zones).toEqual([]);
      expect(r.data.slots).toEqual([]);
      expect(r.data.allowNegativeStock).toBe(false);
      expect(r.data.shared).toBe(false);
    }
  });

  it('coerces allowNegativeStock from string', () => {
    const r = CreateStoreSchema.safeParse({ name: 'X', allowNegativeStock: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.allowNegativeStock).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateStoreSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects > 50 zones', () => {
    const zones = Array.from({ length: 51 }, (_, i) => `Z${i}`);
    expect(CreateStoreSchema.safeParse({ name: 'X', zones }).success).toBe(false);
  });

  it('accepts parentId UUID', () => {
    const r = CreateStoreSchema.safeParse({
      name: 'Section A',
      parentId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-UUID parentId', () => {
    expect(CreateStoreSchema.safeParse({ name: 'X', parentId: 'abc' }).success).toBe(false);
  });

  it('treats empty addressFull fields as null', () => {
    const r = CreateStoreSchema.safeParse({
      name: 'X',
      addressFull: { city: 'Tashkent', street: '' },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.addressFull) {
      expect(r.data.addressFull.city).toBe('Tashkent');
      expect(r.data.addressFull.street).toBeNull();
    }
  });
});

describe('UpdateStoreSchema', () => {
  it('accepts partial (only zones) with the version token', () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, zones: ['Cold', 'Frozen'] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zones).toEqual(['Cold', 'Frozen']);
  });

  it('REQUIRES version — optimistic-lock token cannot be silently omitted', () => {
    expect(UpdateStoreSchema.safeParse({}).success).toBe(false);
    expect(UpdateStoreSchema.safeParse({ zones: ['Cold'] }).success).toBe(false);
  });

  it('accepts version-only payload (no-op edit still bumps version)', () => {
    expect(UpdateStoreSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('accepts null parentId (detach from hierarchy)', () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, parentId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBeNull();
  });
});

describe('StoreAddressFullSchema', () => {
  it('accepts all-optional payload', () => {
    expect(StoreAddressFullSchema.safeParse({}).success).toBe(true);
  });

  it('rejects too-long street', () => {
    expect(StoreAddressFullSchema.safeParse({ street: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('StoreFilterSchema', () => {
  it('coerces archived from "true" string', () => {
    const r = StoreFilterSchema.safeParse({ archived: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.archived).toBe(true);
  });

  it('coerces limit from string', () => {
    const r = StoreFilterSchema.safeParse({ limit: '10' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(10);
  });

  it('rejects limit above max (500)', () => {
    expect(StoreFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts parentId filter', () => {
    const r = StoreFilterSchema.safeParse({ parentId: UUID });
    expect(r.success).toBe(true);
  });

  it('accepts the "root" sentinel for parentId (top-level only)', () => {
    const r = StoreFilterSchema.safeParse({ parentId: 'root' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBe('root');
  });

  it('accepts show enum + name/code/address text filters', () => {
    const r = StoreFilterSchema.safeParse({
      show: 'all',
      name: 'Иподром',
      code: 'MAIN',
      address: 'Tashkent',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.show).toBe('all');
  });

  it('coerces shared from "true" string', () => {
    const r = StoreFilterSchema.safeParse({ shared: 'true' });
    expect(r.success && r.data.shared).toBe(true);
  });

  it('allows sorting by address', () => {
    const r = StoreFilterSchema.safeParse({ sortBy: 'address' });
    expect(r.success).toBe(true);
  });
});

describe('CreateStoreSchema — cellInventory + owner/group', () => {
  it('coerces cellInventory from string and accepts owner/group uuids', () => {
    const r = CreateStoreSchema.safeParse({
      name: 'X',
      cellInventory: 'true',
      ownerId: UUID,
      groupId: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cellInventory).toBe(true);
  });
});

describe('BulkMoveSchema', () => {
  it('accepts ids + null parentId (move to root)', () => {
    const r = BulkMoveSchema.safeParse({ ids: [UUID], parentId: null });
    expect(r.success).toBe(true);
  });

  it('requires at least one id', () => {
    expect(BulkMoveSchema.safeParse({ ids: [], parentId: null }).success).toBe(false);
  });

  it('rejects a "root" sentinel here (move target must be a real store or null)', () => {
    expect(BulkMoveSchema.safeParse({ ids: [UUID], parentId: 'root' }).success).toBe(false);
  });
});

describe('BulkUpdateSchema', () => {
  it('accepts an opt-in patch (archived + groupId clear)', () => {
    const r = BulkUpdateSchema.safeParse({
      ids: [UUID],
      set: { archived: true, groupId: null },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty set (nothing to apply)', () => {
    expect(BulkUpdateSchema.safeParse({ ids: [UUID], set: {} }).success).toBe(false);
  });
});

// F6 — kassa stok-kaskadi prioriteti (`posPriority`, attributes JSON'iga boradi).
describe('posPriority (F6 — kassa kaskadi)', () => {
  it('musbat butun son qabul qilinadi; yubormaslik ham mumkin', () => {
    const r = CreateStoreSchema.safeParse({ name: 'Ombor 07', posPriority: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.posPriority).toBe(1);
    expect(CreateStoreSchema.safeParse({ name: 'X' }).success).toBe(true);
  });

  it('null — kaskaddan chiqarish (0 ga AYLANMAYDI: coerce ataylab yo‘q)', () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, posPriority: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.posPriority).toBeNull();
  });

  it('0, manfiy, kasr va satr rad etiladi', () => {
    for (const bad of [0, -1, 1.5, '1']) {
      expect(CreateStoreSchema.safeParse({ name: 'X', posPriority: bad }).success).toBe(false);
    }
  });
});

// F7 — joylashtirish manbai belgisi (`unassignedSource`, attributes JSON'iga boradi).
describe('unassignedSource (F7 — joylashtirish manbai)', () => {
  it('boolean qabul qilinadi; yubormaslik ham mumkin', () => {
    const r = CreateStoreSchema.safeParse({ name: 'Taqsimlanmagan', unassignedSource: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.unassignedSource).toBe(true);
    const r2 = CreateStoreSchema.safeParse({ name: 'X' });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.unassignedSource).toBeUndefined();
  });

  it("update'da false — belgini olib tashlash", () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, unassignedSource: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.unassignedSource).toBe(false);
  });
});

// G3 — BRAK ombori belgisi (`brakStore`, attributes JSON'iga boradi).
describe('brakStore (G3 — BRAK ombori)', () => {
  it('boolean qabul qilinadi; yubormaslik ham mumkin', () => {
    const r = CreateStoreSchema.safeParse({ name: 'Brak ombori', brakStore: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.brakStore).toBe(true);
    const r2 = CreateStoreSchema.safeParse({ name: 'X' });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.brakStore).toBeUndefined();
  });

  it("update'da false — belgini olib tashlash", () => {
    const r = UpdateStoreSchema.safeParse({ version: 1, brakStore: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.brakStore).toBe(false);
  });
});
