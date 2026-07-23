import { describe, expect, it } from 'vitest';
import {
  CreateCellSchema,
  CreateZoneSchema,
  UpdateCellSchema,
  UpdateZoneSchema,
} from './store-address.schema.js';

const UUID = '00000000-0000-0000-0000-000000000001';

describe('CreateZoneSchema', () => {
  it('accepts a minimal zone and trims the name', () => {
    const r = CreateZoneSchema.safeParse({ name: '  Иподром — 1  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Иподром — 1');
  });

  it('rejects an empty / whitespace-only name', () => {
    expect(CreateZoneSchema.safeParse({ name: '' }).success).toBe(false);
    expect(CreateZoneSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a > 255 char name', () => {
    expect(CreateZoneSchema.safeParse({ name: 'x'.repeat(256) }).success).toBe(false);
  });

  it('coerces sortOrder from a string and rejects negatives', () => {
    const r = CreateZoneSchema.safeParse({ name: 'A', sortOrder: '5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sortOrder).toBe(5);
    expect(CreateZoneSchema.safeParse({ name: 'A', sortOrder: -1 }).success).toBe(false);
  });
});

describe('UpdateZoneSchema', () => {
  it('accepts an empty patch (no-op)', () => {
    expect(UpdateZoneSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty name when name IS provided', () => {
    expect(UpdateZoneSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('CreateCellSchema', () => {
  it('accepts a minimal cell (no zone = «Без зоны хранения»)', () => {
    const r = CreateCellSchema.safeParse({ name: '3-ombor' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('3-ombor');
      // omitted zoneId stays undefined (service treats it as null bucket)
      expect(r.data.zoneId).toBeUndefined();
    }
  });

  it('accepts a valid zoneId and rejects a non-UUID one', () => {
    expect(CreateCellSchema.safeParse({ name: '1', zoneId: UUID }).success).toBe(true);
    expect(CreateCellSchema.safeParse({ name: '1', zoneId: 'abc' }).success).toBe(false);
  });

  it('accepts an explicit null zoneId (no zone)', () => {
    const r = CreateCellSchema.safeParse({ name: '1', zoneId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zoneId).toBeNull();
  });

  it('coalesces an empty / whitespace barcode to null but keeps a real one', () => {
    const empty = CreateCellSchema.safeParse({ name: '1', barcode: '   ' });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.barcode).toBeNull();
    const real = CreateCellSchema.safeParse({ name: '1', barcode: '4780000000001' });
    expect(real.success).toBe(true);
    if (real.success) expect(real.data.barcode).toBe('4780000000001');
  });

  it('rejects an empty name', () => {
    expect(CreateCellSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('UpdateCellSchema — tri-state zoneId', () => {
  it('omitted zoneId ⇒ undefined (leave as-is)', () => {
    const r = UpdateCellSchema.safeParse({ name: '1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zoneId).toBeUndefined();
  });

  it('null zoneId ⇒ null (move to «Без зоны»), preserved distinct from undefined', () => {
    const r = UpdateCellSchema.safeParse({ zoneId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zoneId).toBeNull();
  });

  it('uuid zoneId ⇒ reassign', () => {
    const r = UpdateCellSchema.safeParse({ zoneId: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zoneId).toBe(UUID);
  });
});

describe('CellBarcodeLookupSchema', () => {
  it('accepts a code and trims it', async () => {
    const { CellBarcodeLookupSchema } = await import('./store-address.schema.js');
    const r = CellBarcodeLookupSchema.safeParse({ code: '  CELL-0001  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('CELL-0001');
  });

  it('rejects empty / missing / oversize codes', async () => {
    const { CellBarcodeLookupSchema } = await import('./store-address.schema.js');
    expect(CellBarcodeLookupSchema.safeParse({ code: '   ' }).success).toBe(false);
    expect(CellBarcodeLookupSchema.safeParse({}).success).toBe(false);
    expect(CellBarcodeLookupSchema.safeParse({ code: 'x'.repeat(256) }).success).toBe(false);
  });
});
