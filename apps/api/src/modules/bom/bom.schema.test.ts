import { describe, expect, it } from 'vitest';
import {
  BomComponentInputSchema,
  BomFilterSchema,
  CreateBomSchema,
  SetBomComponentsSchema,
  UpdateBomSchema,
} from './bom.schema.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('BomComponentInputSchema', () => {
  it('accepts valid component', () => {
    const r = BomComponentInputSchema.parse({ productId: UUID, qty: '2.5', position: 0 });
    expect(r.productId).toBe(UUID);
    expect(r.qty).toBe('2.5');
  });

  it('rejects non-decimal qty', () => {
    expect(() => BomComponentInputSchema.parse({ productId: UUID, qty: 'abc' })).toThrow();
  });

  it('rejects zero / non-positive qty', () => {
    expect(() => BomComponentInputSchema.parse({ productId: UUID, qty: '0' })).toThrow();
    expect(() => BomComponentInputSchema.parse({ productId: UUID, qty: '0.000000' })).toThrow();
  });

  it('rejects missing productId', () => {
    expect(() => BomComponentInputSchema.parse({ qty: '1' })).toThrow();
  });

  it('defaults position to 0', () => {
    const r = BomComponentInputSchema.parse({ productId: UUID, qty: '1' });
    expect(r.position).toBe(0);
  });
});

describe('SetBomComponentsSchema', () => {
  it('rejects empty components array', () => {
    expect(() => SetBomComponentsSchema.parse({ components: [] })).toThrow();
  });

  it('accepts valid components', () => {
    const r = SetBomComponentsSchema.parse({
      components: [{ productId: UUID, qty: '3' }],
    });
    expect(r.components).toHaveLength(1);
  });
});

describe('CreateBomSchema', () => {
  it('accepts valid bom', () => {
    const r = CreateBomSchema.parse({ name: 'Test BOM', productId: UUID });
    expect(r.name).toBe('Test BOM');
    expect(r.outputQty).toBe('1'); // default
    expect(r.components).toHaveLength(0);
  });

  it('rejects empty name', () => {
    expect(() => CreateBomSchema.parse({ name: '', productId: UUID })).toThrow();
  });

  it('rejects invalid productId', () => {
    expect(() => CreateBomSchema.parse({ name: 'x', productId: 'not-a-uuid' })).toThrow();
  });

  it('accepts custom outputQty', () => {
    const r = CreateBomSchema.parse({ name: 'x', productId: UUID, outputQty: '10.5' });
    expect(r.outputQty).toBe('10.5');
  });

  it('rejects zero / non-positive outputQty', () => {
    // The regex alone accepts '0'; the .refine enforces the >0 invariant the
    // error message already promises (work-order completion divides by it).
    expect(() => CreateBomSchema.parse({ name: 'x', productId: UUID, outputQty: '0' })).toThrow();
  });

  it('accepts components', () => {
    const r = CreateBomSchema.parse({
      name: 'x',
      productId: UUID,
      components: [{ productId: UUID, qty: '2' }],
    });
    expect(r.components).toHaveLength(1);
  });

  it('accepts the universal «Внешний код» (externalCode)', () => {
    const r = CreateBomSchema.parse({ name: 'x', productId: UUID, externalCode: 'BOM-7' });
    expect(r.externalCode).toBe('BOM-7');
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() =>
      CreateBomSchema.parse({ name: 'x', productId: UUID, externalCode: 'z'.repeat(51) }),
    ).toThrow();
  });
});

describe('UpdateBomSchema — content fields optional, version REQUIRED', () => {
  it('accepts a version-only update (all content fields optional)', () => {
    const r = UpdateBomSchema.parse({ version: 0 });
    expect(r.name).toBeUndefined();
    expect(r.version).toBe(0);
  });

  it('accepts a partial update carrying the optimistic-lock version', () => {
    const r = UpdateBomSchema.parse({ name: 'Updated', version: 3 });
    expect(r.name).toBe('Updated');
    expect(r.version).toBe(3);
  });

  it('rejects an update missing the version (optimistic-lock token is required)', () => {
    expect(() => UpdateBomSchema.parse({ name: 'Updated' })).toThrow();
  });

  it('rejects a negative version', () => {
    expect(() => UpdateBomSchema.parse({ version: -1 })).toThrow();
  });
});

describe('BomFilterSchema', () => {
  it('defaults', () => {
    const r = BomFilterSchema.parse({});
    expect(r.limit).toBe(25);
    expect(r.sortBy).toBe('name');
    expect(r.sortDir).toBe('asc');
  });

  it('parses archived flag from string', () => {
    const r = BomFilterSchema.parse({ archived: 'true' });
    expect(r.archived).toBe(true);
  });
});
