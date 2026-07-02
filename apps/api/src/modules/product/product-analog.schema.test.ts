import { describe, expect, it } from 'vitest';
import { AddAnalogSchema } from './product-analog.schema.js';

describe('AddAnalogSchema', () => {
  it('accepts a valid uuid analogId', () => {
    const r = AddAnalogSchema.parse({ analogId: '11111111-1111-1111-1111-111111111111' });
    expect(r.analogId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects a non-uuid analogId', () => {
    expect(AddAnalogSchema.safeParse({ analogId: 'not-a-uuid' }).success).toBe(false);
    expect(AddAnalogSchema.safeParse({ analogId: '123' }).success).toBe(false);
  });

  it('rejects a missing / empty analogId', () => {
    expect(AddAnalogSchema.safeParse({}).success).toBe(false);
    expect(AddAnalogSchema.safeParse({ analogId: '' }).success).toBe(false);
  });
});
