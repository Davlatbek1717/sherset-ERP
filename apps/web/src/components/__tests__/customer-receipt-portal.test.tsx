import {
  type CustomerReceiptData,
  CustomerReceiptPortal,
} from '@/components/pick-list/customer-receipt-portal';
import { renderWithProviders } from '@/test-utils';
import { describe, expect, it } from 'vitest';

/**
 * «TOVAR CHEKI» — MIJOZGA BERILADIGAN chek to'liq O'ZBEK tilida bo'lishi kerak
 * (egasining talabi 2026-08-10: namuna chek ko'rsatildi — «xuddi shunday, faqat
 * o'zbek tilida»).
 *
 * Nima uchun bu test kerak: barcha yorliqlar `pages.pickLists.receipt_*`
 * kalitlaridan kelgani uchun uz-lokalda o'zbekcha chiqadi, LEKIN summa so'z
 * bilan `ruAmountWords()` orqali qattiq-kodlangan edi — interfeys o'zbekcha
 * bo'lsa ham mijoz «Двести пятьдесят семь тысяч… сумов» yozuvini olardi.
 * Hech bir darvoza buni tutmaydi: i18n key-existence faqat kalit borligini
 * tekshiradi, no-hardcoded esa `app/(app)` ostidagi sahifalarga qaraydi —
 * `components/` ko'rinmaydi.
 */

const DATA: CustomerReceiptData = {
  number: '00123',
  dateStr: '10.08.2026',
  orgName: 'Climart',
  sellerName: 'Admin User',
  buyerName: 'Alisher',
  phone: '+998 90 123 45 67',
  comment: null,
  // Ataylab LOTIN nomlar: kirill tekshiruvi tovar nomidan emas, shablon
  // matnidan kelib chiqishi kerak.
  positions: [
    { name: 'Kabel VVG 3x2.5', uom: 'metr', qty: 10, priceMinor: '1000000', sumMinor: '10000000' },
    { name: 'Avtomat 16A', uom: 'dona', qty: 2, priceMinor: '2500000', sumMinor: '5000000' },
  ],
  discountMinor: 0,
};

describe('CustomerReceiptPortal — o‘zbek tili', () => {
  it("summani so'z bilan o'zbekcha yozadi", () => {
    renderWithProviders(<CustomerReceiptPortal data={DATA} />);

    // 15 000 000 tiyin = 150 000 so'm
    const words = document.body.textContent ?? '';
    expect(words).toContain("Bir yuz ellik ming so'm");
  });

  it('chek matnida kirill harflari qolmaydi', () => {
    renderWithProviders(<CustomerReceiptPortal data={DATA} />);

    const text = document.body.textContent ?? '';
    const cyrillic = text.match(/[Ѐ-ӿ]+/g);
    expect(cyrillic, `kirill matn qoldi: ${cyrillic?.join(', ')}`).toBeNull();
  });
});
