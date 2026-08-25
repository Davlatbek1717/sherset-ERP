import { describe, expect, it } from 'vitest';
import {
  type ReceiptPaymentRow,
  formatForeignMajor,
  receiptPaymentLines,
} from './receipt-payments';

/**
 * F5 — chekning to'lov qatlami. Bu funksiya UCHALA renderer'ning yagona
 * manbasi (`buildReceiptText`, `buildReceiptHtml`, `/print/retail-sale`);
 * xotira: «ombor cheki uch renderer — biri o'zgarsa qolgani jimgina eskiradi».
 *
 * Auditda (2026-08-11) o'lchangan uchta buzuqlik shu yerda qulflanadi:
 *  · «Terminal» qatori HECH QACHON chiqmasdi — `terminalAmountMinor`
 *    `RetailSale` da mavjud bo'lmagan ustun edi, pul «Karta» bo'lib ko'rinardi;
 *  · «Qarz» qatori o'lik edi — `advancePaymentSumMinor` ga hech kim yozmaydi;
 *  · dollar qatori umuman yo'q edi.
 */

const P = (over: Partial<ReceiptPaymentRow>): ReceiptPaymentRow => ({
  method: 'CASH_UZS',
  amountMinor: '0',
  currency: 'UZS',
  rateMinor: null,
  amountBaseMinor: '0',
  ...over,
});

describe('receiptPaymentLines', () => {
  it('to‘lov qatorlarini kanonik tartibda beradi va nolni tashlaydi', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [
        P({ method: 'DEBT', amountMinor: '30000', amountBaseMinor: '30000' }),
        P({ method: 'CARD', amountMinor: '20000', amountBaseMinor: '20000' }),
        P({ method: 'CASH_UZS', amountMinor: '10000', amountBaseMinor: '10000' }),
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(['cash', 'card', 'debt']);
    expect(lines.map((l) => l.baseMinor)).toEqual([10_000n, 20_000n, 30_000n]);
  });

  it('TERMINAL alohida qator — «Karta» ichida yashirinmaydi (audit)', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [
        P({ method: 'CARD', amountMinor: '20000', amountBaseMinor: '20000' }),
        P({ method: 'TERMINAL', amountMinor: '50000', amountBaseMinor: '50000' }),
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(['card', 'terminal']);
    expect(lines.map((l) => l.label)).toEqual(['Karta', 'Terminal']);
  });

  it('QARZ qatori chiqadi — qarzga sotilgan chek endi «jim» emas (audit)', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [P({ method: 'DEBT', amountMinor: '60000', amountBaseMinor: '60000' })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('debt');
    expect(lines[0]?.baseMinor).toBe(60_000n);
  });

  it('dollar qatori ASL sentni, kursni va so‘m ekvivalentini olib yuradi', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [
        P({
          method: 'CASH_USD',
          amountMinor: '1250', // $12.50
          currency: 'USD',
          rateMinor: '1245027000000', // 12 450,27 × 10^8
          amountBaseMinor: '15562837', // serverdan kelgan so'm ekvivalenti
        }),
      ],
    });
    const usd = lines[0];
    expect(usd?.kind).toBe('cashUsd');
    // 🔴 So'm ekvivalenti SERVERNIKI — FE uni qayta hisoblamaydi.
    expect(usd?.baseMinor).toBe(15_562_837n);
    expect(usd?.foreign).toEqual({
      amountMinor: 1250n,
      currency: 'USD',
      rateMinor: 1_245_027_000_000n,
    });
  });

  it('so‘m + dollar aralash — ikkala qator ham chiqadi, qaytim so‘mda', () => {
    const lines = receiptPaymentLines({
      changeMinor: '5000',
      payments: [
        P({ method: 'CASH_UZS', amountMinor: '100000', amountBaseMinor: '100000' }),
        P({
          method: 'CASH_USD',
          amountMinor: '1000',
          currency: 'USD',
          rateMinor: '1245027000000',
          amountBaseMinor: '12450270',
        }),
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(['cash', 'cashUsd', 'change']);
    expect(lines[2]?.baseMinor).toBe(5_000n);
    expect(lines[2]?.foreign).toBeNull();
  });

  it('noma’lum kanal (kelgusi CLICK/PAYME) jimgina TUSHIB QOLMAYDI', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [P({ method: 'CLICK', amountMinor: '70000', amountBaseMinor: '70000' })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('other');
    expect(lines[0]?.label).toBe('CLICK');
  });

  it('eski chek (to‘lov qatorlari yo‘q) legacy ustunlardan o‘qiladi', () => {
    const lines = receiptPaymentLines({
      payments: [],
      cashAmountMinor: '80000',
      cardAmountMinor: '20000',
      changeMinor: '0',
    });
    expect(lines.map((l) => l.kind)).toEqual(['cash', 'card']);
    expect(lines.map((l) => l.baseMinor)).toEqual([80_000n, 20_000n]);
  });

  it('`payments` umuman kelmasa ham yiqilmaydi (eski API javobi)', () => {
    const lines = receiptPaymentLines({ cashAmountMinor: '80000' });
    expect(lines.map((l) => l.kind)).toEqual(['cash']);
  });

  it('bir kanalning bir nechta qatori QO‘SHILADI', () => {
    const lines = receiptPaymentLines({
      payments: [
        P({ method: 'CASH_UZS', amountMinor: '10000', amountBaseMinor: '10000' }),
        P({ method: 'CASH_UZS', amountMinor: '5000', amountBaseMinor: '5000' }),
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.baseMinor).toBe(15_000n);
  });

  it('kurssiz dollar qatori (buzuq ma’lumot) so‘m qatoriday bosiladi, otmaydi', () => {
    const lines = receiptPaymentLines({
      payments: [
        P({
          method: 'CASH_USD',
          amountMinor: '1000',
          currency: 'USD',
          rateMinor: null,
          amountBaseMinor: '12450270',
        }),
      ],
    });
    expect(lines[0]?.kind).toBe('cashUsd');
    expect(lines[0]?.foreign).toBeNull();
  });
});

/**
 * A2 (2026-08-25) — «Avansdan» qatori. Xaritaga qo'shilmasa qator `other`
 * bo'lib chekning OXIRIDA, mijozga beriladigan qog'ozda xom `PREPAY` so'zi
 * bilan bosilardi.
 */
describe('receiptPaymentLines — A2 «Avansdan»', () => {
  it('PREPAY qatori o`z yorlig`i bilan va QARZDAN OLDIN chiqadi', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [
        P({ method: 'DEBT', amountMinor: '30000', amountBaseMinor: '30000' }),
        P({ method: 'PREPAY', amountMinor: '40000', amountBaseMinor: '40000' }),
        P({ method: 'CASH_UZS', amountMinor: '30000', amountBaseMinor: '30000' }),
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(['cash', 'prepay', 'debt']);
    expect(lines.find((l) => l.kind === 'prepay')?.label).toBe('Avansdan');
    expect(lines.find((l) => l.kind === 'prepay')?.baseMinor).toBe(40_000n);
  });

  it('PREPAY `other` chelagiga TUSHMAYDI (xom kalit bosilmaydi)', () => {
    const lines = receiptPaymentLines({
      changeMinor: '0',
      payments: [P({ method: 'PREPAY', amountMinor: '40000', amountBaseMinor: '40000' })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('prepay');
    expect(lines[0]?.label).not.toBe('PREPAY');
  });
});

describe('formatForeignMajor', () => {
  it('sentni ikki kasrli major ko‘rinishga o‘giradi', () => {
    expect(formatForeignMajor(1250n, 'USD')).toBe('$12.50');
    expect(formatForeignMajor(7n, 'USD')).toBe('$0.07');
    expect(formatForeignMajor(123456n, 'USD')).toBe('$1234.56');
  });

  it('manfiy qiymatda minus SUMMADAN OLDIN turadi («$-10.00» emas)', () => {
    // Audit-to'lqinidagi 21-bug bilan bir xil qoida.
    expect(formatForeignMajor(-1000n, 'USD')).toBe('-$10.00');
  });
});
