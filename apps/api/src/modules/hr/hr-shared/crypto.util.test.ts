import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptHrSession, encryptHrSession } from './crypto.util.js';

describe('HR session encryption', () => {
  beforeAll(() => {
    if (!process.env.HR_SESSION_KEY) {
      process.env.HR_SESSION_KEY = randomBytes(32).toString('base64');
    }
  });

  it('round-trip: encrypted ciphertext decrypts to original', () => {
    const plain = 'gramjs StringSession data 1ABCdef';
    const enc = encryptHrSession(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptHrSession(enc)).toBe(plain);
  });

  it('different plaintexts produce different ciphertexts (random IV)', () => {
    const a = encryptHrSession('payload-a');
    const b = encryptHrSession('payload-a');
    expect(a).not.toBe(b);
  });

  it('tampered ciphertext fails authentication tag check', () => {
    const enc = encryptHrSession('payload');
    const [iv, cipher, tag] = enc.split(':') as [string, string, string];
    const tampered = `${iv}:${cipher.slice(0, -2)}ff:${tag}`;
    expect(() => decryptHrSession(tampered)).toThrow();
  });

  it('throws when HR_SESSION_KEY missing', () => {
    const orig = process.env.HR_SESSION_KEY;
    process.env.HR_SESSION_KEY = '';
    try {
      expect(() => encryptHrSession('x')).toThrow(/HR_SESSION_KEY/);
    } finally {
      process.env.HR_SESSION_KEY = orig;
    }
  });

  it('throws when HR_SESSION_KEY wrong length', () => {
    const orig = process.env.HR_SESSION_KEY;
    process.env.HR_SESSION_KEY = randomBytes(16).toString('base64');
    try {
      expect(() => encryptHrSession('x')).toThrow(/32 bytes/);
    } finally {
      process.env.HR_SESSION_KEY = orig;
    }
  });
});
