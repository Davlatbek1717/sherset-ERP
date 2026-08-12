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
    organization: { name: 'Sherset MChJ', legalTitle: null, phone: '+998908769900' },
  },
  positions: [
    {
      quantity: '1',
      priceMinor: '15000000',
      sumMinor: '15000000',
      product: { name: 'Kabel', uom: 'm' },
    },
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

/**
 * 🔴 SHABLON QULFI (2026-08-12, egasining namunasi `chek.png`).
 *
 * Kassa cheki ilgari o'zining «termal tasma» ko'rinishida edi: o'lchov
 * birligi ustuni, chegirma qatori, nomenklatura soni, summa so'z bilan va
 * huquqiy izoh UMUMAN yo'q edi. Uchala renderer bir vaqtda o'zgardi —
 * bu blok ularning har birida shablon bloklari borligini tekshiradi, ya'ni
 * bittasi keyinchalik jimgina eskirsa test qizil bo'ladi.
 */
const TEMPLATE_BLOCKS = [
  'SAVDO CHEKI',
  'Sana',
  'Sotuvchi',
  'Xaridor',
  'Izoh',
  "O'lch. birligi",
  'Soni',
  'Narxi',
  'Summa',
  "Chek bo'yicha umumiy summa",
  'Chegirma',
  'Jami summa',
  'Jami nomenklaturalar soni',
  'Raqam bilan',
  "Ushbu chek to'lovni tasdiqlovchi hujjat hisoblanadi.",
  'Rahmat, bizni tanlaganingiz uchun!',
];

/**
 * 32 ustunli lentada uzun matn O'RALADI, ya'ni «…hujjat hisoblanadi.» ikki
 * qatorga bo'linadi. Tekshiruv MAZMUN ustida bo'lishi kerak, joylashuv
 * ustida emas — shuning uchun bo'shliqlar tekislanadi.
 */
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('chek shabloni — uchala renderer bir xil bloklarni chiqaradi', () => {
  it.each(TEMPLATE_BLOCKS)('ESC/POS matnida «%s» bor', (block) => {
    expect(flat(buildReceiptText(MIXED as never))).toContain(flat(block));
  });

  it.each(TEMPLATE_BLOCKS)('Electron HTML da «%s» bor', (block) => {
    expect(flat(buildReceiptHtml(MIXED as never))).toContain(flat(block));
  });

  it('shapkada do`kon nomi va TELEFON bor', () => {
    const txt = buildReceiptText(MIXED as never);
    expect(txt).toContain('Sherset MChJ');
    expect(txt).toContain('+998908769900');
    expect(buildReceiptHtml(MIXED as never)).toContain('+998908769900');
  });

  it('pozitsiya qatorida o`lchov birligi ham bor', () => {
    expect(buildReceiptText(MIXED as never)).toContain('m x');
    expect(buildReceiptHtml(MIXED as never)).toContain('>m<');
  });

  it('🔴 matn cheki 32 ustundan oshmaydi (printer o`ng chetini qirqmasin)', () => {
    for (const line of buildReceiptText(MIXED as never).split('\n')) {
      expect(line.length, `uzun qator: «${line}»`).toBeLessThanOrEqual(32);
    }
  });

  it('eski «JAMI»/«Xarid uchun rahmat!» matnlari qaytib kelmaydi', () => {
    const txt = buildReceiptText(MIXED as never);
    expect(txt).not.toContain('Xarid uchun rahmat!');
    expect(buildReceiptHtml(MIXED as never)).not.toContain('Xarid uchun rahmat!');
  });
});
