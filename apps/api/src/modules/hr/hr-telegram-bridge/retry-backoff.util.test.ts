import { describe, expect, it } from 'vitest';
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_BACKOFF_SECONDS,
  isExhausted,
  nextRetryAt,
} from './retry-backoff.util.js';

describe('retry-backoff', () => {
  it('exposes the yangibolim parity schedule (30 → 90 → 270s, MAX=3)', () => {
    expect(RETRY_BACKOFF_SECONDS).toEqual([30, 90, 270]);
    expect(MAX_RETRY_ATTEMPTS).toBe(3);
  });

  it('first failure → +30s', () => {
    const now = new Date('2026-05-21T10:00:00Z');
    const next = nextRetryAt(0, now);
    expect(next?.toISOString()).toBe('2026-05-21T10:00:30.000Z');
  });

  it('second failure (retryCount=1) → +90s', () => {
    const now = new Date('2026-05-21T10:00:00Z');
    expect(nextRetryAt(1, now)?.toISOString()).toBe('2026-05-21T10:01:30.000Z');
  });

  it('third failure (retryCount=2) → +270s', () => {
    const now = new Date('2026-05-21T10:00:00Z');
    expect(nextRetryAt(2, now)?.toISOString()).toBe('2026-05-21T10:04:30.000Z');
  });

  it('after 3 attempts (retryCount=3) → null (caller marks failed)', () => {
    expect(nextRetryAt(3)).toBeNull();
    expect(nextRetryAt(99)).toBeNull();
  });

  it('isExhausted aligned with nextRetryAt null transition', () => {
    expect(isExhausted(0)).toBe(false);
    expect(isExhausted(1)).toBe(false);
    expect(isExhausted(2)).toBe(false);
    expect(isExhausted(3)).toBe(true);
    expect(isExhausted(10)).toBe(true);
  });

  it('negative retryCount defensive null', () => {
    expect(nextRetryAt(-1)).toBeNull();
  });
});
