import { describe, expect, it } from 'vitest';
import { OmborchiConfirmSchema, RejectSchema } from './supply-approval.schema.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('OmborchiConfirmSchema', () => {
  it('valid adjustments', () =>
    expect(
      OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: UUID, quantity: '8.5' }] })
        .success,
    ).toBe(true));
  it('adjustments default []', () =>
    expect(OmborchiConfirmSchema.parse({}).adjustments).toEqual([]));
  it('non-decimal quantity rad', () =>
    expect(
      OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: UUID, quantity: 'abc' }] })
        .success,
    ).toBe(false));
  it('non-uuid positionId rad', () =>
    expect(
      OmborchiConfirmSchema.safeParse({ adjustments: [{ positionId: 'x', quantity: '1' }] })
        .success,
    ).toBe(false));
});

describe('RejectSchema', () => {
  it("bo'sh sabab rad", () => expect(RejectSchema.safeParse({ reason: '' }).success).toBe(false));
  it('sabab bilan qabul', () =>
    expect(RejectSchema.safeParse({ reason: 'kam keldi' }).success).toBe(true));
});
