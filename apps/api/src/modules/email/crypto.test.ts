import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetKeyCache, decryptPassword, encryptPassword } from './crypto.js';

describe('email/crypto', () => {
  const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-key-deterministic';
    _resetKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      // biome-ignore lint/performance/noDelete: must REMOVE the env var, not blank it — `process.env.X = undefined` stores the literal string "undefined", which would make the key-absent branch untestable
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    }
    _resetKeyCache();
  });

  it('round-trips ASCII password', () => {
    const cipher = encryptPassword('hunter2');
    expect(decryptPassword(cipher)).toBe('hunter2');
  });

  it('round-trips unicode password', () => {
    const cipher = encryptPassword('салют🚀пар0лъ');
    expect(decryptPassword(cipher)).toBe('салют🚀пар0лъ');
  });

  it('encrypts the same plaintext to different ciphertexts (random IV)', () => {
    const a = encryptPassword('same');
    const b = encryptPassword('same');
    expect(a).not.toBe(b);
    expect(decryptPassword(a)).toBe('same');
    expect(decryptPassword(b)).toBe('same');
  });

  it('rejects empty plaintext', () => {
    expect(() => encryptPassword('')).toThrow(/empty/);
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decryptPassword('shorty')).toThrow();
  });

  it('rejects ciphertext encrypted under a different key', () => {
    const cipher = encryptPassword('hunter2');

    process.env.EMAIL_ENCRYPTION_KEY = 'a-different-key';
    _resetKeyCache();
    expect(() => decryptPassword(cipher)).toThrow();
  });

  it('handles long passwords (1KB)', () => {
    const longPass = 'x'.repeat(1024);
    expect(decryptPassword(encryptPassword(longPass))).toBe(longPass);
  });
});
