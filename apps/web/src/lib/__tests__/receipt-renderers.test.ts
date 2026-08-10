import { buildReceiptHtml, buildReceiptText } from '@/lib/print-agent';
import { describe, expect, it } from 'vitest';

/**
 * F5 — chekning ikkita MATNLI renderer'i (`buildReceiptText` = ESC/POS,
 * `buildReceiptHtml` = Electron native) `RetailSalePayment` qatorlaridan
 * o'qiydi. Uchinchisi (React `/print/retail-sale`) alohida testda —
 * uchalasi bitta manbadan (`receiptPaymentLines`) oziqlanadi.
 *
 * Bu yerda qulflanadigan xulq (auditda o'lchangan buzuqliklar):
 *  · TERMINAL alohida qator (ilgari «Karta» ichida yashirinardi);
 *  · QARZ qatori chiqadi (ilgari o'lik `advancePaymentSumMinor` o'qilardi);
 *  · DOLLAR qatori asl sent + muzlatilgan kurs + so'm ekvivalenti bilan;
 *  · so'm ekvivalenti SERVERNIKI — FE kursdan qayta hisoblamaydi.
 */

const SALE = (over: Record<string, unknown> = {}) => ({
  name: 'CHEK-00042',
  moment: '2026-08-11T05:30:00.000Z',
  sumMinor: '15000000',
  cashAmountMinor: '0',
  cardAmountMinor: '0',
  changeMinor: '0',
  description: null,
  agent: null,
  session: {
    cashDesk: { name: 'Asosiy kassa' },
    cashier: { name: 'Kassir Aliyev' },
    store: { name: 'Markaziy dokon' },
    organization: { name: 'Sherset MChJ', legalTitle: null },
  },
  positions: [
    { quantity: '1', priceMinor: '15000000', sumMinor: '15000000', product: { name: 'Kabel' } },
  ],
  payments: [],
  ...over,
});

const MIXED = SALE({
  payments: [
    {
      method: 'CASH_UZS',
      amountMinor: '5000000',
      currency: 'UZS',
      rateMinor: null,
      amountBaseMinor: '5000000',
    },
    {
      method: 'CASH_USD',
      amountMinor: '1250',
      currency: 'USD',
      rateMinor: '1245027000000',
      amountBaseMinor: '15562837',
    },
    {
      method: 'TERMINAL',
      amountMinor: '3000000',
      currency: 'UZS',
      rateMinor: null,
      amountBaseMinor: '3000000',
    },
    {
      method: 'DEBT',
      amountMinor: '2000000',
      currency: 'UZS',
      rateMinor: null,
      amountBaseMinor: '2000000',
    },
  ],
});

describe('buildReceiptText — ESC/POS chek', () => {
  it('dollar qatorini asl sent, kurs va so‘m ekvivalenti bilan bosadi', () => {
    const txt = buildReceiptText(MIXED as never);
    expect(txt).toContain('Dollar');
    expect(txt).toContain('$12.50');
    expect(txt).toContain('12450.27');
    // 155 628 = 15 562 837 tiyin (serverning o'z raqami, yaxlitlangan).
    expect(txt).toContain('155 628');
  });

  it('TERMINAL va QARZ alohida qator (audit: ikkalasi ham chiqmasdi)', () => {
    const txt = buildReceiptText(MIXED as never);
    expect(txt).toContain('Terminal');
    expect(txt).toContain('Qarz');
  });

  it('to‘lov qatorlari yo‘q eski chekda legacy ustunlar bosiladi', () => {
    const txt = buildReceiptText(
      SALE({ payments: [], cashAmountMinor: '8000000', cardAmountMinor: '7000000' }) as never,
    );
    expect(txt).toContain('Naqd');
    expect(txt).toContain('Karta');
  });

  it('qaytim qatori chiqadi', () => {
    const txt = buildReceiptText(
      SALE({
        changeMinor: '500000',
        payments: [
          {
            method: 'CASH_UZS',
            amountMinor: '20000000',
            currency: 'UZS',
            rateMinor: null,
            amountBaseMinor: '20000000',
          },
        ],
      }) as never,
    );
    expect(txt).toContain('Qaytim');
  });
});

describe('buildReceiptHtml — Electron native chek', () => {
  it('matnli renderer bilan BIR XIL qatorlarni chiqaradi', () => {
    const html = buildReceiptHtml(MIXED as never);
    expect(html).toContain('Naqd');
    expect(html).toContain('Dollar');
    expect(html).toContain('$12.50');
    expect(html).toContain('12450.27');
    expect(html).toContain('Terminal');
    expect(html).toContain('Qarz');
  });

  it('eski chekda legacy ustunlardan o‘qiydi', () => {
    const html = buildReceiptHtml(
      SALE({ payments: [], cashAmountMinor: '8000000', cardAmountMinor: '7000000' }) as never,
    );
    expect(html).toContain('Naqd');
    expect(html).toContain('Karta');
  });
});
