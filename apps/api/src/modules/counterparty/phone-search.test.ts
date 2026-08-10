import { describe, expect, it } from 'vitest';
import { PHONE_MIN_DIGITS, isPhoneQuery, phoneDigits } from './phone-search.js';

/**
 * F9 — kassada eng tez identifikator TELEFON.
 *
 * O'LCHANGAN holat (2026-08-11, `climart_adopt`): `counterparties.phone` —
 * `VarChar(20)`, **normalizatsiyasiz** saqlanadi (POS'dagi «yangi mijoz»
 * maydoni erkin matn), va uning ustida HECH QANDAY indeks yo'q. Mavjud
 * `?search=` esa `phone contains` qiladi — ya'ni kassir `901234567` yozsa,
 * bazada `+998 90 123 45 67` turgan mijoz TOPILMAYDI.
 *
 * Bu modul — sof qism: so'rov «telefon» ekanini aniqlaydi va uni raqamga
 * keltiradi. Solishtirish tomoni SQL'da (`regexp_replace`) — chunki
 * saqlangan qiymatni ham normalizatsiya qilish kerak.
 */
describe('F9 — telefon so`rovini aniqlash', () => {
  it.each([
    ['901234567', '901234567'],
    ['+998 90 123 45 67', '998901234567'],
    ['(90) 123-45-67', '901234567'],
    ['90.123.45.67', '901234567'],
  ])('«%s» → raqamlar «%s»', (raw, digits) => {
    expect(phoneDigits(raw)).toBe(digits);
    expect(isPhoneQuery(raw)).toBe(true);
  });

  it('ism yozilsa telefon so`rovi EMAS (qimmat skan bekorga yugurmasin)', () => {
    expect(isPhoneQuery('Alisher')).toBe(false);
    expect(isPhoneQuery('Alisher 90')).toBe(false);
    // Kod/hujjat raqami ichidagi harflar ham telefon emas.
    expect(isPhoneQuery('QRZ-00012')).toBe(false);
  });

  it('juda qisqa raqam telefon so`rovi EMAS', () => {
    // 4 raqam butun bazani qaytarardi; chegara ataylab tor.
    expect(PHONE_MIN_DIGITS).toBe(5);
    expect(isPhoneQuery('9012')).toBe(false);
    expect(isPhoneQuery('90123')).toBe(true);
  });

  it('bo`sh / faqat ajratgichlar — telefon so`rovi emas', () => {
    expect(isPhoneQuery('')).toBe(false);
    expect(isPhoneQuery('   ')).toBe(false);
    expect(isPhoneQuery('+-() ')).toBe(false);
    expect(phoneDigits('+-() ')).toBe('');
  });

  it('juda uzun raqam qatori rad etiladi (SQL argumenti chegaralangan)', () => {
    expect(isPhoneQuery('1'.repeat(25))).toBe(false);
  });
});
