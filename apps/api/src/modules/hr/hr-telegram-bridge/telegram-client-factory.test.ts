import { describe, expect, it } from 'vitest';
import { isGramjsFloodError, isSessionPasswordNeededError } from './telegram-client-factory.js';

describe('isGramjsFloodError', () => {
  it('matches gramjs FloodWaitError by className + seconds', () => {
    const err = Object.assign(new Error('FLOOD_WAIT_60'), {
      className: 'FloodWaitError',
      seconds: 60,
    });
    expect(isGramjsFloodError(err)).toBe(true);
  });

  it('matches by errorMessage prefix when className differs', () => {
    const err = Object.assign(new Error('FLOOD_WAIT_30'), {
      errorMessage: 'FLOOD_WAIT_30',
      seconds: 30,
    });
    expect(isGramjsFloodError(err)).toBe(true);
  });

  it('rejects plain Error', () => {
    expect(isGramjsFloodError(new Error('boom'))).toBe(false);
  });

  it('rejects flood-looking object without numeric `seconds`', () => {
    const err = { className: 'FloodWaitError', seconds: 'sixty' };
    expect(isGramjsFloodError(err)).toBe(false);
  });

  it('rejects null / undefined / primitives', () => {
    expect(isGramjsFloodError(null)).toBe(false);
    expect(isGramjsFloodError(undefined)).toBe(false);
    expect(isGramjsFloodError(42)).toBe(false);
    expect(isGramjsFloodError('FLOOD_WAIT')).toBe(false);
  });
});

describe('isSessionPasswordNeededError', () => {
  it('matches gramjs SessionPasswordNeededError by className', () => {
    const err = Object.assign(new Error('2fa needed'), {
      className: 'SessionPasswordNeededError',
    });
    expect(isSessionPasswordNeededError(err)).toBe(true);
  });

  it('matches by errorMessage substring (resilience to class rename)', () => {
    const err = Object.assign(new Error('boom'), {
      errorMessage: 'SESSION_PASSWORD_NEEDED',
    });
    expect(isSessionPasswordNeededError(err)).toBe(true);
  });

  it('rejects plain Error / null', () => {
    expect(isSessionPasswordNeededError(new Error('boom'))).toBe(false);
    expect(isSessionPasswordNeededError(null)).toBe(false);
  });
});
