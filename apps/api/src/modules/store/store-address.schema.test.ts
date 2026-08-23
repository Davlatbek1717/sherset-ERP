import { describe, expect, it } from 'vitest';
import { type CellRangeSpec, expandCellRange } from './cell-range.util.js';
import {
  BulkCreateCellsSchema,
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

describe('BulkCreateCellsSchema', () => {
  const ok = {
    template: '{a}-{b}',
    variables: [
      { key: 'a', kind: 'number', from: 1, to: 5, pad: 2 },
      { key: 'b', kind: 'letter', from: 'A', to: 'C' },
    ],
    zoneFrom: 'a',
  };

  it("to'g'ri retseptni qabul qiladi, dryRun default false", () => {
    const r = BulkCreateCellsSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dryRun).toBe(false);
  });

  it('dryRun uzatilsa saqlanadi', () => {
    const r = BulkCreateCellsSchema.safeParse({ ...ok, dryRun: true });
    expect(r.success && r.data.dryRun).toBe(true);
  });

  it("zoneFrom null bo'lishi mumkin", () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, zoneFrom: null }).success).toBe(true);
  });

  it("bo'sh shablon rad etiladi", () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, template: '' }).success).toBe(false);
  });

  it("noma'lum kind rad etiladi", () => {
    const bad = { ...ok, variables: [{ key: 'a', kind: 'roman', from: 1, to: 3 }] };
    expect(BulkCreateCellsSchema.safeParse(bad).success).toBe(false);
  });

  it("variables bo'sh massiv rad etiladi", () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, variables: [] }).success).toBe(false);
  });

  it("o'zgaruvchilar soni 6 tadan oshsa rad etiladi", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      kind: 'number' as const,
      from: 1,
      to: 2,
    }));
    expect(BulkCreateCellsSchema.safeParse({ ...ok, variables: many }).success).toBe(false);
  });

  it("manfiy `from` Zod'dan O'TADI — semantik xato countOf'da chiqadi", () => {
    // Zod faqat shakl/tipni tekshiradi. Manfiy diapazon — semantik qoida,
    // uning yagona manzili cell-range.util.ts dagi countOf(); u xatoda
    // o'zgaruvchi NOMINI beradi, Zod esa umumiy xabar berardi.
    const r = BulkCreateCellsSchema.safeParse({
      ...ok,
      variables: [{ key: 'a', kind: 'number', from: -3, to: 5 }],
    });
    expect(r.success).toBe(true);
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: r.success ? r.data.variables : [],
        zoneFrom: null,
      }),
    ).toThrow(/manfiy son bo'lmaydi/);
  });

  it("chegaradan tashqari `pad` Zod'dan O'TADI — semantik xato countOf'da chiqadi", () => {
    const r = BulkCreateCellsSchema.safeParse({
      ...ok,
      variables: [{ key: 'a', kind: 'number', from: 1, to: 3, pad: 9 }],
    });
    expect(r.success).toBe(true);
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: r.success ? r.data.variables : [],
        zoneFrom: null,
      }),
    ).toThrow(/nol-to'ldirish/);
  });

  // Zod chiqishi Task 1 ning CellRangeSpec'iga struktur mos bo'lishi SHART —
  // aks holda servis `expandCellRange(input)` ni chaqira olmaydi.
  it('sxema chiqishi CellRangeSpec bilan mos', () => {
    const parsed = BulkCreateCellsSchema.parse(ok);
    const spec: CellRangeSpec = {
      template: parsed.template,
      variables: parsed.variables,
      zoneFrom: parsed.zoneFrom,
    };
    expect(spec.variables).toHaveLength(2);
  });
});

describe('WarehouseNumberingSchema', () => {
  const ok = { warehouseNo: '03', stelajlar: [{ qavatlar: 4, orinlar: 10 }] };

  it("to'g'ri retseptni qabul qiladi, dryRun default false", async () => {
    const { WarehouseNumberingSchema } = await import('./store-address.schema.js');
    const r = WarehouseNumberingSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dryRun).toBe(false);
  });

  it("son ko'rinishidagi satrlar coerce qilinadi (input maydonidan keladi)", async () => {
    const { WarehouseNumberingSchema } = await import('./store-address.schema.js');
    const r = WarehouseNumberingSchema.safeParse({
      warehouseNo: ' 03 ',
      stelajlar: [{ qavatlar: '4', orinlar: '10' }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.warehouseNo).toBe('03');
      expect(r.data.stelajlar[0]).toEqual({ qavatlar: 4, orinlar: 10 });
    }
  });

  it("bo'sh stelajlar / 99 tadan ko'p stelaj / uzun ombor raqami rad etiladi", async () => {
    const { WarehouseNumberingSchema } = await import('./store-address.schema.js');
    expect(WarehouseNumberingSchema.safeParse({ ...ok, stelajlar: [] }).success).toBe(false);
    expect(
      WarehouseNumberingSchema.safeParse({
        ...ok,
        stelajlar: Array.from({ length: 100 }, () => ({ qavatlar: 1, orinlar: 1 })),
      }).success,
    ).toBe(false);
    expect(WarehouseNumberingSchema.safeParse({ ...ok, warehouseNo: '123' }).success).toBe(false);
  });

  it("qavatlar=0 Zod'dan O'TADI — semantik xato expandWarehouseNumbering'da", async () => {
    // BulkCreateCells bilan bir xil taqsimot: Zod shakl, util semantika —
    // util xatosi stelaj RAQAMINI aytadi, Zod esa umumiy xabar berardi.
    const { WarehouseNumberingSchema } = await import('./store-address.schema.js');
    const { expandWarehouseNumbering } = await import('./cell-range.util.js');
    const r = WarehouseNumberingSchema.safeParse({
      warehouseNo: '03',
      stelajlar: [{ qavatlar: 0, orinlar: 1 }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(() => expandWarehouseNumbering(r.data)).toThrow(/1-stelaj/);
  });
});
