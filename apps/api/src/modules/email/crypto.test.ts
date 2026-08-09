import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetKeyCache,
  decryptBuffer,
  decryptPassword,
  encryptBuffer,
  encryptPassword,
  isEncryptedBuffer,
} from './crypto.js';

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

/**
 * Faza 24 (`INT-06`) — binar variant. EDO PFX (ECP xususiy kaliti) `Bytes`
 * maydonida saqlanadi: base64-string qatlamisiz, o'z-o'zini taniydigan
 * sarlavha bilan (eski SHIFRLANMAGAN qatorlarni ajratish uchun).
 */
describe('email/crypto — buffer variant', () => {
  const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-key-deterministic';
    _resetKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      // biome-ignore lint/performance/noDelete: must REMOVE the env var, not blank it
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    }
    _resetKeyCache();
  });

  // DER SEQUENCE bilan boshlanadigan realistik PFX-o'xshash bayt oqimi.
  const pfx = Buffer.concat([
    Buffer.from([0x30, 0x82, 0x0a, 0x1b]),
    Buffer.from('SECRET-KEY-BYTES'),
  ]);

  it('round-trips binary bytes', () => {
    expect(decryptBuffer(encryptBuffer(pfx)).equals(pfx)).toBe(true);
  });

  it('ciphertext contains none of the plaintext', () => {
    const cipher = encryptBuffer(pfx);
    expect(cipher.includes(Buffer.from('SECRET-KEY-BYTES'))).toBe(false);
    expect(cipher.equals(pfx)).toBe(false);
  });

  it('random IV — same input, different ciphertext', () => {
    expect(encryptBuffer(pfx).equals(encryptBuffer(pfx))).toBe(false);
  });

  it('isEncryptedBuffer distinguishes ciphertext from a raw PFX', () => {
    expect(isEncryptedBuffer(encryptBuffer(pfx))).toBe(true);
    expect(isEncryptedBuffer(pfx)).toBe(false);
    expect(isEncryptedBuffer(Buffer.alloc(0))).toBe(false);
  });

  it('rejects a tampered auth tag (GCM integrity)', () => {
    const cipher = encryptBuffer(pfx);
    cipher[cipher.length - 1] ^= 0xff;
    expect(() => decryptBuffer(cipher)).toThrow();
  });

  it('refuses unmarked (legacy plaintext) input instead of returning garbage', () => {
    expect(() => decryptBuffer(pfx)).toThrow(/encrypt/i);
  });

  it('rejects ciphertext encrypted under a different key', () => {
    const cipher = encryptBuffer(pfx);
    process.env.EMAIL_ENCRYPTION_KEY = 'a-different-key';
    _resetKeyCache();
    expect(() => decryptBuffer(cipher)).toThrow();
  });

  it('handles a realistic 4KB key blob', () => {
    const big = Buffer.alloc(4096, 0x5a);
    expect(decryptBuffer(encryptBuffer(big)).equals(big)).toBe(true);
  });

  it('rejects empty input', () => {
    expect(() => encryptBuffer(Buffer.alloc(0))).toThrow(/empty/);
  });
});
