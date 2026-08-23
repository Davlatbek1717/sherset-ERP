import { describe, expect, it } from 'vitest';
import { pickPriceToMajor, pickPriceToMinor } from './ProductPickModal.tsx';

describe('pickPriceToMinor', () => {
  it('converts a bare "1" to 100 minor (UZS)', () => {
    expect(pickPriceToMinor('1', 'UZS')).toBe('100');
  });
  it('converts a typed major sum to minor', () => {
    expect(pickPriceToMinor('890000', 'UZS')).toBe('89000000');
  });
  it('accepts grouped input with a decimal comma', () => {
    expect(pickPriceToMinor('15 000,50', 'UZS')).toBe('1500050');
  });
  it('treats empty input as zero', () => {
    expect(pickPriceToMinor('', 'UZS')).toBe('0');
  });
});

describe('pickPriceToMajor', () => {
  it("drops a zero fraction so a whole so'm sum stays clean", () => {
    expect(pickPriceToMajor('4500000', 'UZS')).toBe('45000');
  });
  it('KEEPS a real tiyin fraction', () => {
    expect(pickPriceToMajor('4500050', 'UZS')).toBe('45000.50');
  });
  it('yields empty (not a placeholder amount) when the product has no price', () => {
    expect(pickPriceToMajor(undefined, 'UZS')).toBe('');
    expect(pickPriceToMajor('', 'UZS')).toBe('');
  });
  it('round-trips back through pickPriceToMinor', () => {
    for (const minor of ['4500000', '4500050', '100', '0']) {
      expect(pickPriceToMinor(pickPriceToMajor(minor, 'UZS'), 'UZS')).toBe(minor);
    }
  });
});
