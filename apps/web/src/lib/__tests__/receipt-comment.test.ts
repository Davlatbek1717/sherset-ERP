import { buildReceiptHtml, buildReceiptText } from '@/lib/print-agent';
import { describe, expect, it } from 'vitest';

/**
 * CHEK IZOHI chop etilgan chekda (2026-08-19, egasi: «har bir chekka izoh»).
 *
 * 🔴 Ikki tomonlama shartnoma:
 *  · izoh BOR bo'lsa — chekda «Izoh:» qatori chiqadi (aks holda kassir yozgan
 *    matn hech qayerga yetib bormasdi);
 *  · izoh BO'SH bo'lsa — qator UMUMAN chizilmaydi. Ilgari har chekda bo'sh
 *    «Izoh:» chiqib turardi (maydonni hech kim to'ldirmasdi), ya'ni chekda
 *    ma'nosiz qator va qo'shimcha qog'oz sarflanardi.
 *
 * Ikkala renderer ham sinaladi: termal ESC/POS matni va Electron HTML'i —
 * ular alohida kod yo'llari, biri tuzatilib ikkinchisi unutilishi klassik.
 */

const SALE = {
  name: 'CHEK-1',
  moment: '2026-08-13T10:00:00.000Z',
  sumMinor: '1000',
  cashAmountMinor: '1000',
  cardAmountMinor: '0',
  changeMinor: '0',
  description: null as string | null,
  agent: null,
  session: {
    cashDesk: { name: 'Kassa' },
    cashier: { name: 'Kassir' },
    store: null,
    organization: { name: 'Sherset', legalTitle: null, phone: null },
  },
  positions: [
    {
      quantity: '1',
      priceMinor: '1000',
      sumMinor: '1000',
      basePriceMinor: null,
      product: { name: 'Tovar' },
    },
  ],
};

const withComment = (c: string | null) => ({ ...SALE, description: c }) as never;

describe('Chek chopi — izoh qatori', () => {
  it('🔴 izoh bor: termal chekda «Izoh: …» chiqadi', () => {
    expect(buildReceiptText(withComment('Ertaga olib ketadi'))).toContain(
      'Izoh: Ertaga olib ketadi',
    );
  });

  it('🔴 izoh bo`sh: termal chekda «Izoh» qatori UMUMAN yo`q', () => {
    expect(buildReceiptText(withComment(null))).not.toContain('Izoh');
    expect(buildReceiptText(withComment('   '))).not.toContain('Izoh');
  });

  it('izoh bor: HTML chekda ham chiqadi', () => {
    expect(buildReceiptHtml(withComment('Qarzga berildi'))).toContain('Qarzga berildi');
  });

  it('izoh bo`sh: HTML chekda «Izoh» qatori yo`q', () => {
    expect(buildReceiptHtml(withComment(null))).not.toContain('Izoh');
  });
});
