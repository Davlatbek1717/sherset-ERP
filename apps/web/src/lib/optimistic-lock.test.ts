import { describe, expect, it } from 'vitest';
import { isOptimisticConflict } from './optimistic-lock';

/**
 * Guards the front-end half of the optimistic-lock contract: only a 409 whose
 * body carries `code: 'OPTIMISTIC_LOCK'` is a concurrency conflict (→ reload
 * dialog). Any other error — including a plain 409 (e.g. a unique-constraint
 * clash) — must fall through to the normal error toast. The error shape mirrors
 * what api-client.ts attaches (`.status`, `.body`).
 */
describe('isOptimisticConflict', () => {
  it('is true for a 409 with body.code OPTIMISTIC_LOCK', () => {
    const err = Object.assign(new Error('conflict'), {
      status: 409,
      body: { code: 'OPTIMISTIC_LOCK', message: 'Product was modified by another user.' },
    });
    expect(isOptimisticConflict(err)).toBe(true);
  });

  it('is false for a 409 that is NOT an optimistic-lock conflict (e.g. unique clash)', () => {
    const err = Object.assign(new Error('duplicate'), {
      status: 409,
      body: { message: 'Duplicate value on unique field: code' },
    });
    expect(isOptimisticConflict(err)).toBe(false);
  });

  it('is false for the OPTIMISTIC_LOCK code on a non-409 status', () => {
    const err = Object.assign(new Error('x'), {
      status: 400,
      body: { code: 'OPTIMISTIC_LOCK' },
    });
    expect(isOptimisticConflict(err)).toBe(false);
  });

  it('is false for a generic error, null, and primitives', () => {
    expect(isOptimisticConflict(new Error('boom'))).toBe(false);
    expect(isOptimisticConflict(null)).toBe(false);
    expect(isOptimisticConflict(undefined)).toBe(false);
    expect(isOptimisticConflict('OPTIMISTIC_LOCK')).toBe(false);
    expect(isOptimisticConflict({ status: 409 })).toBe(false);
  });
});
