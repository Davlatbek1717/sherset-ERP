import { describe, expect, it } from 'vitest';
import { type UnresolvedSale, describeUnresolvedSales, formatSom } from './unresolved-sales.js';

/**
 * P3 — smena yopilishini bloklovchi xabar KASSIRGA TUSHUNARLI bo'lishi.
 *
 * Bu «matn testi» emas, xulq testi: xabar 400-javob sifatida to'g'ridan
 * to'g'ri kassirning ekraniga chiqadi va u NIMA QILISHNI shundan bilishi
 * kerak. Ilgari u inglizcha va faqat SON edi («Session has 4 unresolved
 * sale(s) (draft/picking/ready). Post or cancel them before closing.») —
 * prodda esa 5 ta qotgan chek POS'ning IKKI BOSHQA bo'limida yotibdi, ya'ni
 * kassir qaysi birini qidirishni ham bilmasdi.
 */

const sale = (name: string, state: string, sumMinor: bigint): UnresolvedSale => ({
  name,
  state,
  sumMinor,
});

describe('P3 — formatSom', () => {
  it('tiyinni so‘mga o‘giradi va uch xonali guruhlaydi', () => {
    expect(formatSom(8_460_000n)).toBe('84 600');
    expect(formatSom(3_500_000n)).toBe('35 000');
    expect(formatSom(100n)).toBe('1');
    expect(formatSom(0n)).toBe('0');
  });

  it('million va undan katta summalarni ham guruhlaydi', () => {
    expect(formatSom(1_211_680_000n)).toBe('12 116 800');
  });

  /**
   * Locale'ga bog'liq bo'lmasligi — `toLocaleString` ATAYLAB ishlatilmagan.
   * Bo'shliq AYNAN oddiy probel bo'lishi kerak: ba'zi locale'lar NBSP yoki
   * vergul qo'yadi va prod bilan test bir-biriga mos kelmay qolardi.
   */
  it('ajratgich — oddiy probel (NBSP yoki vergul EMAS)', () => {
    expect(formatSom(8_460_000n)).toContain(' ');
    expect(formatSom(8_460_000n)).not.toContain(' ');
    expect(formatSom(8_460_000n)).not.toContain(',');
  });
});

describe('P3 — yakunlanmagan cheklar xabari', () => {
  it('nima qilish kerakligini AYTADI (to‘lash yoki bekor qilish)', () => {
    const msg = describeUnresolvedSales([sale('ТРН-2026-00010', 'picking', 3_500_000n)]);
    expect(msg).toContain("TO'LANG");
    expect(msg).toContain('BEKOR QILING');
  });

  it('har chekni nomi, bosqichi va summasi bilan sanaydi', () => {
    const msg = describeUnresolvedSales([
      sale('ТРН-2026-00010', 'picking', 3_500_000n),
      sale('ТРН-2026-00017', 'ready', 8_430_000n),
    ]);
    expect(msg).toContain("ТРН-2026-00010 (yig'ilmoqda, 35 000 so'm)");
    expect(msg).toContain("ТРН-2026-00017 (yig'ilgan, 84 300 so'm)");
    expect(msg).toContain('2 ta chek');
  });

  it('savatdagi chek ham o‘z bosqichi bilan chiqadi', () => {
    const msg = describeUnresolvedSales([sale('ТРН-1', 'draft', 100n)]);
    expect(msg).toContain('ТРН-1 (savatda, 1 so‘m)'.replace('‘', "'"));
  });

  /**
   * Xabar POS toast'iga sig'ishi kerak — uzun ro'yxat birinchi (eng muhim)
   * qatorni ekrandan chiqarib yuborardi.
   */
  it('uzun ro‘yxat qisqartiriladi, lekin JAMI son yashirilmaydi', () => {
    const many = Array.from({ length: 12 }, (_, i) => sale(`ТРН-${i}`, 'picking', 1000n));
    const msg = describeUnresolvedSales(many);
    expect(msg).toContain('12 ta chek');
    expect(msg).toContain('va yana 4 ta');
    expect(msg).toContain('ТРН-0');
    expect(msg).not.toContain('ТРН-11 (');
  });

  it('qisqartirish chegarasiga TENG ro‘yxatda «va yana» yozilmaydi', () => {
    const eight = Array.from({ length: 8 }, (_, i) => sale(`ТРН-${i}`, 'ready', 1000n));
    expect(describeUnresolvedSales(eight)).not.toContain('va yana');
  });

  /**
   * FSM'ga yangi holat qo'shilsa xabar «undefined» chiqarmasligi kerak —
   * xom holat nomi tushunarsiz, lekin YOLG'ON emas.
   */
  it('notanish bosqich xom nomi bilan chiqadi (undefined EMAS)', () => {
    const msg = describeUnresolvedSales([sale('ТРН-9', 'quarantined', 1000n)]);
    expect(msg).toContain('ТРН-9 (quarantined, 10 so‘m)'.replace('‘', "'"));
    expect(msg).not.toContain('undefined');
  });
});
