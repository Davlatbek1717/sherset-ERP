import { describe, expect, it } from 'vitest';
import { pickPriceToMinor } from './ProductPickModal.tsx';

describe('pickPriceToMinor', () => {
  it('converts the default "1" to 100 minor (UZS)', () => {
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
