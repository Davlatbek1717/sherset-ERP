import { describe, expect, it } from 'vitest';
import { COUNTRIES, COUNTRY_NAME_BY_CODE } from './countries.ts';

describe('countries reference (ISO 3166-1)', () => {
  it('is a non-trivial list', () => {
    // Sanity floor — the full ISO set is ~240+; guard against accidental truncation.
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });

  it('every code is a 2-letter uppercase ISO alpha-2', () => {
    for (const c of COUNTRIES) {
      expect(c.code, `${c.name}`).toMatch(/^[A-Z]{2}$/);
      expect(c.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes (dedup applied)', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('is sorted by Russian name', () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ru'));
    expect(names).toEqual(sorted);
  });

  it('includes the regionally common countries', () => {
    const byCode = COUNTRY_NAME_BY_CODE;
    expect(byCode.UZ).toBe('Узбекистан');
    expect(byCode.RU).toBe('Россия');
    expect(byCode.KZ).toBe('Казахстан');
    expect(byCode.CN).toBe('Китай');
    expect(byCode.US).toBe('США');
  });
});
