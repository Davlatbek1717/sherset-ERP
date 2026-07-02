import { describe, expect, it } from 'vitest';
import { normalizeTelegramPhone } from './phone-normalize.util.js';

describe('normalizeTelegramPhone', () => {
  it('returns null for null / undefined / empty / whitespace-only', () => {
    expect(normalizeTelegramPhone(null)).toBeNull();
    expect(normalizeTelegramPhone(undefined)).toBeNull();
    expect(normalizeTelegramPhone('')).toBeNull();
    expect(normalizeTelegramPhone('   ')).toBeNull();
  });

  it('passes through canonical +998 form', () => {
    expect(normalizeTelegramPhone('+998901234567')).toBe('+998901234567');
  });

  it('strips whitespace + dashes + parens', () => {
    expect(normalizeTelegramPhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  it('prepends + to 998-prefixed input', () => {
    expect(normalizeTelegramPhone('998901234567')).toBe('+998901234567');
  });

  it('expands 9-digit Uzbek mobile to canonical', () => {
    expect(normalizeTelegramPhone('901234567')).toBe('+998901234567');
  });

  it('expands legacy 10-digit "8 90…" to canonical', () => {
    expect(normalizeTelegramPhone('8901234567')).toBe('+998901234567');
  });

  it('keeps foreign numbers as +<digits> (no Uzbek prefix coercion)', () => {
    expect(normalizeTelegramPhone('+1 (202) 555-0123')).toBe('+12025550123');
  });

  it('rejects non-digit characters', () => {
    expect(() => normalizeTelegramPhone('+998-abc-1234')).toThrow(/faqat raqam/);
  });

  it('rejects too-short numbers (<9 digits)', () => {
    expect(() => normalizeTelegramPhone('12345678')).toThrow(/9-15 raqam/);
  });

  it('rejects too-long numbers (>15 digits)', () => {
    expect(() => normalizeTelegramPhone('+1234567890123456')).toThrow(/9-15 raqam/);
  });
});
