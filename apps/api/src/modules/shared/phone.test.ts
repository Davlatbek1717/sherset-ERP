import { describe, expect, it } from 'vitest';
import { formatUzPhone, normalizeUzPhone, tryNormalizeUzPhone } from './phone.js';

describe('tryNormalizeUzPhone — accepted shapes', () => {
  const E164 = '+998901234567';

  it.each([
    '+998901234567',
    '998901234567',
    '8901234567',
    '0901234567',
    '901234567',
    '+998 90 123 45 67',
    '+998 (90) 123-45-67',
    '90-123-45-67',
    '90 123 45 67',
    '90.123.45.67',
  ])('normalises %s', (input) => {
    expect(tryNormalizeUzPhone(input)).toBe(E164);
  });

  it('accepts every UZ operator prefix', () => {
    for (const op of ['33', '88', '90', '91', '93', '94', '95', '97', '98', '99']) {
      const phone = `+998${op}1234567`;
      expect(tryNormalizeUzPhone(phone)).toBe(phone);
    }
  });

  it('rejects operator codes not in the UZ list', () => {
    for (const op of ['11', '22', '50', '92', '96']) {
      expect(tryNormalizeUzPhone(`+998${op}1234567`)).toBe(null);
    }
  });
});

describe('tryNormalizeUzPhone — rejected shapes', () => {
  it.each([
    '', // empty
    '   ', // whitespace
    '12345', // too short
    '+998901', // too short with prefix
    '+99890123456789012', // too long
    '+1234567890', // wrong country
    '+998121234567', // operator code 12 — not in UZ list
    '+998801234567', // operator code 80 — not in UZ list
    'abc', // not digits
    '𝟗𝟗𝟖𝟗𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕', // mathematical bold digits — not ASCII
  ])('rejects %p', (input) => {
    expect(tryNormalizeUzPhone(input)).toBe(null);
  });
});

describe('normalizeUzPhone — strict variant', () => {
  it('returns the canonical form on valid input', () => {
    expect(normalizeUzPhone('90 123 45 67')).toBe('+998901234567');
  });

  it('throws on invalid input', () => {
    expect(() => normalizeUzPhone('abc')).toThrow(/Telefon formati/);
  });

  it('truncates the error to first 30 chars to avoid leaking PII into logs', () => {
    const long = '0'.repeat(200);
    try {
      normalizeUzPhone(long);
      expect.fail('should throw');
    } catch (e) {
      expect((e as Error).message).toHaveLength(
        `Telefon formati noto'g'ri: ${'0'.repeat(30)}`.length,
      );
    }
  });
});

describe('formatUzPhone — display variant', () => {
  it('groups digits as +998 90 123 45 67', () => {
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('returns empty string on null/undefined', () => {
    expect(formatUzPhone(null)).toBe('');
    expect(formatUzPhone(undefined)).toBe('');
  });

  it('returns the input unchanged when it is not a canonical UZ number', () => {
    expect(formatUzPhone('+1234567890')).toBe('+1234567890');
  });
});
