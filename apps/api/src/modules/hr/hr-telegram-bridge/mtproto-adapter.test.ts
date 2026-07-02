import { describe, expect, it } from 'vitest';
import { MtprotoFloodError, NoopMtprotoAdapter, isMtprotoFloodError } from './mtproto-adapter.js';

describe('MtprotoFloodError', () => {
  it('carries slot + retryAfterSeconds and is detected by isMtprotoFloodError', () => {
    const err = new MtprotoFloodError(2, 120);
    expect(err.slot).toBe(2);
    expect(err.retryAfterSeconds).toBe(120);
    expect(err.isFlood).toBe(true);
    expect(isMtprotoFloodError(err)).toBe(true);
  });

  it('plain Error is NOT a flood error', () => {
    expect(isMtprotoFloodError(new Error('boom'))).toBe(false);
    expect(isMtprotoFloodError(null)).toBe(false);
    expect(isMtprotoFloodError(undefined)).toBe(false);
    expect(isMtprotoFloodError('string')).toBe(false);
    expect(isMtprotoFloodError({ isFlood: false })).toBe(false);
  });

  it('default message includes slot + window for log readability', () => {
    expect(new MtprotoFloodError(1, 60).message).toMatch(/slot=1/);
    expect(new MtprotoFloodError(1, 60).message).toMatch(/60s/);
  });
});

describe('NoopMtprotoAdapter', () => {
  it('always throws a non-flood Error so the worker schedules a retry', async () => {
    const adapter = new NoopMtprotoAdapter();
    await expect(
      adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'hi' }),
    ).rejects.toThrow(/not_configured/);
    // Crucially, NOT a flood error — the worker will use regular backoff,
    // not pause an MTProto slot that doesn't exist.
    try {
      await adapter.sendMessage({ accountId: 'acc1', toPhone: '+998901234567', text: 'hi' });
    } catch (e) {
      expect(isMtprotoFloodError(e)).toBe(false);
    }
  });
});
