import { describe, expect, it } from 'vitest';
import { secretEquals } from './timing-safe.js';

/**
 * Faza 21 (`INT-01`, `INT-14`) — sir-solishtirish helperi.
 *
 * Bu yerda TIMING o'lchanmaydi (o'lchov flaky bo'lardi) — `timingSafeEqual`
 * ishlatilgani `constant-time-secret-class.test.ts` klass-qulfi bilan
 * lock qilinadi. Bu fayl FUNKSIONAL shartnomani (ayniqsa fail-closed
 * xulqni) qotiradi.
 */
describe('secretEquals', () => {
  it('bir xil sirlar → true', () => {
    expect(secretEquals('s3cr3t-token', 's3cr3t-token')).toBe(true);
  });

  it('bir xil uzunlikdagi farqli sirlar → false', () => {
    expect(secretEquals('s3cr3t-tokeX', 's3cr3t-token')).toBe(false);
  });

  it('uzunligi farq qilsa YIQILMAYDI, false qaytaradi (xom timingSafeEqual throw qilardi)', () => {
    expect(() => secretEquals('short', 'a-much-longer-secret')).not.toThrow();
    expect(secretEquals('short', 'a-much-longer-secret')).toBe(false);
  });

  it('unicode sirlar bayt darajasida to‘g‘ri solishtiriladi', () => {
    expect(secretEquals('пароль-٣٤', 'пароль-٣٤')).toBe(true);
    expect(secretEquals('пароль-٣٤', 'пароль-٣٥')).toBe(false);
  });

  // FAIL-CLOSED: sozlanmagan sir «hamma o'tadi» ma'nosini BERMAYDI.
  // `''  === ''` (eski payme kodi) aynan shu teshikni ochib turgan edi.
  it("ikkala tomon ham bo'sh → false (fail-closed)", () => {
    expect(secretEquals('', '')).toBe(false);
  });

  it('null/undefined tomon → false', () => {
    expect(secretEquals(null, 'secret')).toBe(false);
    expect(secretEquals('secret', null)).toBe(false);
    expect(secretEquals(undefined, undefined)).toBe(false);
    expect(secretEquals('secret', undefined)).toBe(false);
  });
});
