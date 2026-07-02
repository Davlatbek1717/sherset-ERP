import { describe, expect, it } from 'vitest';
import { buildCronExpr } from './cron-builder.util.js';

describe('buildCronExpr', () => {
  it('weekly mon-fri at 09:00 → "0 9 * * 1,2,3,4,5"', () => {
    expect(buildCronExpr({ time: '09:00', mode: 'weekly', days: [1, 2, 3, 4, 5] })).toBe(
      '0 9 * * 1,2,3,4,5',
    );
  });

  it('weekly Sunday at 23:30 (ISO 7 → cron 0)', () => {
    expect(buildCronExpr({ time: '23:30', mode: 'weekly', days: [7] })).toBe('30 23 * * 0');
  });

  it('monthly day 15 at 15:00', () => {
    expect(buildCronExpr({ time: '15:00', mode: 'monthly', dayOfMonth: 15 })).toBe('0 15 15 * *');
  });

  it('weekly single Monday → "0 9 * * 1"', () => {
    expect(buildCronExpr({ time: '09:00', mode: 'weekly', days: [1] })).toBe('0 9 * * 1');
  });

  it('weekly all 7 days (ISO 1..7) → sorted with Sun=0 at the front', () => {
    expect(buildCronExpr({ time: '09:00', mode: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] })).toBe(
      '0 9 * * 0,1,2,3,4,5,6',
    );
  });

  it('throws on bad time format (defensive — Zod usually blocks first)', () => {
    expect(() => buildCronExpr({ time: '25:99', mode: 'weekly', days: [1] })).toThrow(
      /vaqt format/,
    );
  });

  it('weekly with empty days[] throws', () => {
    expect(() => buildCronExpr({ time: '09:00', mode: 'weekly', days: [] })).toThrow(/days/);
  });

  it('monthly without dayOfMonth throws', () => {
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing defensive guard
      buildCronExpr({ time: '09:00', mode: 'monthly' } as any),
    ).toThrow(/dayOfMonth/);
  });
});
