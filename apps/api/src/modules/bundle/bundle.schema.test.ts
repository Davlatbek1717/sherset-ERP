import { describe, expect, it } from 'vitest';
import { BundleComponentInputSchema, SetBundleComponentsSchema } from './bundle.schema.js';

const uuid = () => crypto.randomUUID();

describe('BundleComponentInputSchema', () => {
  it('accepts product-referenced component', () => {
    const r = BundleComponentInputSchema.safeParse({
      componentProductId: uuid(),
      quantity: '2',
    });
    expect(r.success).toBe(true);
  });

  it('accepts variant-referenced component', () => {
    const r = BundleComponentInputSchema.safeParse({
      componentVariantId: uuid(),
      quantity: '1.5',
    });
    expect(r.success).toBe(true);
  });

  it('rejects component with neither productId nor variantId', () => {
    expect(BundleComponentInputSchema.safeParse({ quantity: '1' }).success).toBe(false);
  });

  it('rejects non-decimal quantity', () => {
    expect(
      BundleComponentInputSchema.safeParse({
        componentProductId: uuid(),
        quantity: 'not-a-number',
      }).success,
    ).toBe(false);
  });

  it('rejects negative quantity sign', () => {
    expect(
      BundleComponentInputSchema.safeParse({
        componentProductId: uuid(),
        quantity: '-5',
      }).success,
    ).toBe(false);
  });

  it('defaults position to 0', () => {
    const r = BundleComponentInputSchema.safeParse({
      componentProductId: uuid(),
      quantity: '1',
    });
    if (!r.success) throw r.error;
    expect(r.data.position).toBe(0);
  });
});

describe('SetBundleComponentsSchema', () => {
  it('accepts a minimal list', () => {
    const r = SetBundleComponentsSchema.safeParse({
      components: [{ componentProductId: uuid(), quantity: '1' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty list', () => {
    expect(SetBundleComponentsSchema.safeParse({ components: [] }).success).toBe(false);
  });
});
