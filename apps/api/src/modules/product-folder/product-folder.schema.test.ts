import { describe, expect, it } from 'vitest';
import { CreateProductFolderSchema, UpdateProductFolderSchema } from './product-folder.schema.js';

describe('CreateProductFolderSchema', () => {
  it('parses a minimal valid folder with defaults', () => {
    const r = CreateProductFolderSchema.parse({ name: 'Ichimliklar' });
    expect(r.name).toBe('Ichimliklar');
    expect(r.vatEnabled).toBe(true);
    expect(r.useParentVat).toBe(true);
  });

  it('requires a non-empty name', () => {
    expect(() => CreateProductFolderSchema.parse({ name: '' })).toThrow();
  });

  it('accepts optional «Внешний код» (externalCode)', () => {
    const r = CreateProductFolderSchema.parse({ name: 'A', externalCode: 'PF-7' });
    expect(r.externalCode).toBe('PF-7');
  });

  it('rejects an externalCode longer than 50 chars', () => {
    expect(() =>
      CreateProductFolderSchema.parse({ name: 'A', externalCode: 'z'.repeat(51) }),
    ).toThrow();
  });
});

describe('UpdateProductFolderSchema (.partial())', () => {
  it('accepts a lone externalCode patch', () => {
    const r = UpdateProductFolderSchema.parse({ externalCode: 'PF-PATCH' });
    expect(r.externalCode).toBe('PF-PATCH');
  });

  it('accepts an empty patch', () => {
    expect(UpdateProductFolderSchema.parse({})).toEqual({});
  });
});
