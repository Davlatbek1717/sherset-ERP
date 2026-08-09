import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEASE_EXPIRED_NOTE,
  OUTBOX_SENDING,
  claimLeaseUntil,
  dedupNote,
  dedupSince,
  outboxDedupWindowMs,
  outboxLeaseMs,
} from './outbox-claim.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OUTBOX_SENDING', () => {
  it("is 'sending' — an EXIT status, not the incumbent 'pending'", () => {
    // A claim that writes the same status back locks nothing: the rival's
    // `updateMany WHERE status IN ('pending','retry')` still matches. The
    // whole fix hinges on the claimed status leaving the sendable set.
    expect(OUTBOX_SENDING).toBe('sending');
    expect(['pending', 'retry']).not.toContain(OUTBOX_SENDING);
  });

  it("is not 'processing' — webhook.schema.test.ts locks that word out", () => {
    expect(OUTBOX_SENDING).not.toBe('processing');
  });
});

describe('lease', () => {
  it('defaults to 5 minutes in the future', () => {
    const now = new Date('2026-08-09T10:00:00.000Z');
    expect(claimLeaseUntil(now).toISOString()).toBe('2026-08-09T10:05:00.000Z');
    expect(outboxLeaseMs()).toBe(300_000);
  });

  it('honours OUTBOX_CLAIM_LEASE_MS', () => {
    vi.stubEnv('OUTBOX_CLAIM_LEASE_MS', '60000');
    const now = new Date('2026-08-09T10:00:00.000Z');
    expect(claimLeaseUntil(now).toISOString()).toBe('2026-08-09T10:01:00.000Z');
  });

  it('ignores garbage / non-positive env values (falls back to the default)', () => {
    for (const bad of ['', 'abc', '0', '-5']) {
      vi.stubEnv('OUTBOX_CLAIM_LEASE_MS', bad);
      expect(outboxLeaseMs()).toBe(300_000);
    }
  });
});

describe('dedup window', () => {
  it('defaults to 24h in the past', () => {
    const now = new Date('2026-08-09T10:00:00.000Z');
    expect(dedupSince(now).toISOString()).toBe('2026-08-08T10:00:00.000Z');
    expect(outboxDedupWindowMs()).toBe(86_400_000);
  });

  it('honours OUTBOX_DEDUP_WINDOW_MS', () => {
    vi.stubEnv('OUTBOX_DEDUP_WINDOW_MS', '3600000');
    const now = new Date('2026-08-09T10:00:00.000Z');
    expect(dedupSince(now).toISOString()).toBe('2026-08-09T09:00:00.000Z');
  });
});

describe('operator notes', () => {
  it('dedupNote carries the twin delivery timestamp when known', () => {
    expect(dedupNote(new Date('2026-08-09T09:59:00.000Z'))).toContain('2026-08-09T09:59:00.000Z');
    expect(dedupNote(null)).toContain('dedup');
    expect(dedupNote(null)).not.toContain('undefined');
  });

  it('LEASE_EXPIRED_NOTE says the outcome is unknown (not "failed")', () => {
    expect(LEASE_EXPIRED_NOTE).toMatch(/outcome unknown/);
  });
});
