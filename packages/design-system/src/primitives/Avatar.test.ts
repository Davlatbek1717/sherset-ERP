import { describe, expect, it } from 'vitest';
import { AVATAR_TINTS, colorFor, deriveInitials } from './Avatar.tsx';

describe('Avatar.deriveInitials', () => {
  it('returns 2 letters from a 2-word name', () => {
    expect(deriveInitials('Ozodbek Mirgasimov')).toBe('OM');
  });

  it('uppercases the result', () => {
    expect(deriveInitials('alice bob')).toBe('AB');
  });

  it('takes the first 2 letters of a single-word name', () => {
    expect(deriveInitials('alice')).toBe('AL');
  });

  it('handles cyrillic names', () => {
    expect(deriveInitials('Иван Петров')).toBe('ИП');
  });

  it('caps at the first 2 words even when 3+ are present', () => {
    expect(deriveInitials('John James Robert Smith')).toBe('JJ');
  });

  it('trims surrounding whitespace', () => {
    expect(deriveInitials('  spaced  ')).toBe('SP');
  });

  it('falls back to ? on empty input', () => {
    expect(deriveInitials('')).toBe('?');
    expect(deriveInitials('   ')).toBe('?');
  });
});

describe('Avatar.colorFor', () => {
  it('is deterministic — same name always picks the same tint', () => {
    expect(colorFor('Ozodbek')).toBe(colorFor('Ozodbek'));
  });

  it('returns a value from the AVATAR_TINTS palette', () => {
    expect(AVATAR_TINTS).toContain(colorFor('John'));
    expect(AVATAR_TINTS).toContain(colorFor('Jane'));
    expect(AVATAR_TINTS).toContain(colorFor(''));
  });

  it('distinguishes most distinct names', () => {
    const palette = new Set(['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Mallory'].map(colorFor));
    expect(palette.size).toBeGreaterThanOrEqual(3);
  });
});
