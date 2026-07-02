import { describe, expect, it } from 'vitest';
import {
  CreatePrepaymentReturnSchema,
  UpdatePrepaymentReturnSchema,
} from './prepayment-return.schema.js';

describe('UpdatePrepaymentReturnSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    // All edit fields are optional; the only required key is the lock token.
    expect(UpdatePrepaymentReturnSchema.safeParse({}).success).toBe(false);
    expect(UpdatePrepaymentReturnSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative / string version', () => {
    expect(UpdatePrepaymentReturnSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdatePrepaymentReturnSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdatePrepaymentReturnSchema.safeParse({ version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(
      CreatePrepaymentReturnSchema.safeParse({
        prepaymentId: '11111111-1111-1111-1111-111111111111',
        sumMinor: '100000',
      }).success,
    ).toBe(true);
  });
});
