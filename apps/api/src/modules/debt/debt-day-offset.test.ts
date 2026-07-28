import { describe, expect, it } from 'vitest';
import { DebtController } from './debt.controller';

/**
 * `/debts/calls/today?dayOffset=` guard (MASTER-TODO #139 / #142).
 *
 * The `dayOffset` query param — and the whole `/debts/calls/tomorrow` page it
 * serves — was lost in the climart adoption and restored on 2026-07-28. While
 * restoring it, an unbounded value was shown to crash the endpoint:
 *
 *   new Date(Date.now() + 5h + 1e15 * 86_400_000).toISOString()
 *     → RangeError: Invalid time value  → unhandled 500
 *
 * These locks pin the parse+clamp so a hostile or fat-fingered query can never
 * reach the date math, and so `dayOffset=0` keeps the pre-existing behaviour
 * (`includeOverdue` default stays `true` — see #139b for the deliberate
 * behaviour deltas that were NOT ported from main).
 */

function callWith(dayOffset?: string) {
  const captured: { dayOffset?: number; includeOverdue?: boolean }[] = [];
  const service = {
    todayCalls: (_accountId: string, opts: { dayOffset?: number; includeOverdue?: boolean }) => {
      captured.push(opts);
      return Promise.resolve({ rows: [] });
    },
  };
  const controller = new DebtController(
    service as unknown as ConstructorParameters<typeof DebtController>[0],
    {} as ConstructorParameters<typeof DebtController>[1],
  );
  controller.todayCalls(
    { accountId: 'acc-1' } as Parameters<DebtController['todayCalls']>[0],
    undefined,
    undefined,
    dayOffset,
  );
  return captured[0];
}

describe('debts calls — dayOffset parse + clamp', () => {
  it('omitted → 0 (today; existing behaviour untouched)', () => {
    const opts = callWith(undefined);
    expect(opts?.dayOffset).toBe(0);
    expect(opts?.includeOverdue).toBe(true);
  });

  it('empty string → 0', () => {
    expect(callWith('')?.dayOffset).toBe(0);
  });

  it('non-numeric → 0 (never NaN into the date math)', () => {
    expect(callWith('abc')?.dayOffset).toBe(0);
    expect(callWith('NaN')?.dayOffset).toBe(0);
  });

  it('"1" → 1 (the /debts/calls/tomorrow case)', () => {
    expect(callWith('1')?.dayOffset).toBe(1);
  });

  it('fractional → truncated', () => {
    expect(callWith('1.9')?.dayOffset).toBe(1);
    expect(callWith('-1.9')?.dayOffset).toBe(-1);
  });

  it('clamps the crash vector — huge values never reach new Date()', () => {
    expect(callWith('1e15')?.dayOffset).toBe(366);
    expect(callWith('-1e15')?.dayOffset).toBe(-366);
    expect(callWith('99999999')?.dayOffset).toBe(366);
  });

  it('Infinity is rejected (Number.isFinite guard)', () => {
    expect(callWith('Infinity')?.dayOffset).toBe(0);
    expect(callWith('-Infinity')?.dayOffset).toBe(0);
  });

  it('every clamped value survives the service date math', () => {
    const TASHKENT_OFFSET_MS = 5 * 3600_000;
    const DAY_MS = 86_400_000;
    for (const offset of [-366, -1, 0, 1, 366]) {
      const shifted = new Date(Date.now() + TASHKENT_OFFSET_MS + offset * DAY_MS);
      expect(() => shifted.toISOString()).not.toThrow();
    }
  });
});
