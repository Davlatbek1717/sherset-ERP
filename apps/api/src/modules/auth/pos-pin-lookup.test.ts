import { describe, expect, it } from 'vitest';
import { posPinLookupHash, resolvePosPinPepper } from './pos-pin-lookup.js';

describe('posPinLookupHash', () => {
  it('deterministik — bir xil PIN + pepper = bir xil hex', () => {
    expect(posPinLookupHash('1234', 'pepper-a')).toBe(posPinLookupHash('1234', 'pepper-a'));
  });

  it('64 belgili hex qaytaradi (SHA-256)', () => {
    expect(posPinLookupHash('1234', 'pepper-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pepper o'zgarsa natija o'zgaradi — «pepper yo'qolsa PIN qayta beriladi» shartnomasi", () => {
    expect(posPinLookupHash('1234', 'pepper-a')).not.toBe(posPinLookupHash('1234', 'pepper-b'));
  });

  it('turli PIN — turli natija', () => {
    expect(posPinLookupHash('1234', 'p')).not.toBe(posPinLookupHash('1235', 'p'));
  });

  it('PIN saqlanmaydi: chiqishda PIN matni yo`q (bir tomonlama)', () => {
    expect(posPinLookupHash('1234', 'p')).not.toContain('1234');
  });
});

describe('resolvePosPinPepper', () => {
  it("prod'da pepper yo`q bo`lsa BOOT'da yiqiladi — jim ishlamaydi", () => {
    expect(() => resolvePosPinPepper(undefined, 'production')).toThrow(/POS_PIN_PEPPER/);
  });

  it("prod'da dev-fallback qiymati ham rad etiladi", () => {
    expect(() => resolvePosPinPepper('dev-pos-pin-pepper-change-in-prod', 'production')).toThrow(
      /POS_PIN_PEPPER/,
    );
  });

  it("dev'da fallback beriladi", () => {
    expect(resolvePosPinPepper(undefined, 'development')).toBe('dev-pos-pin-pepper-change-in-prod');
  });
});
