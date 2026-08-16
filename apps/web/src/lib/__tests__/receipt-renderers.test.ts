import { debtReceiptToSaleInput } from '@/lib/pos/receipt-debt-model';
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

/**
 * P05 (2026-08-13, egasi) — chek oxirida «Sizning qarzingiz: …».
 *
 * Qiymat modeldan (`debtAfterMinor`, manba `/debts/pos/summary` → payableMinor,
 * post'dan KEYINGI qoldiq). Ikkala matnli renderer BIRGA yangilanadi (xotira
 * `ombor-chek-uch-renderer`); uchinchisi (React `TovarChek`) o'z testida.
 * null = o'lchanmagan, 0 = qarz yo'q — ikkalasida ham qator CHIQMAYDI.
 */
describe('P05 — «Sizning qarzingiz» qatori', () => {
  it('ikkala matnli renderer qatorni chiqaradi (qarz > 0)', () => {
    const sale = SALE({ debtAfterMinor: 125000000n });
    const txt = buildReceiptText(sale as never);
    expect(txt).toContain('Sizning qarzingiz');
    expect(txt).toContain('1 250 000');
    const html = buildReceiptHtml(sale as never);
    expect(html).toContain('Sizning qarzingiz');
    expect(html).toContain('1 250 000');
  });

  it('qarz 0, null yoki umuman berilmagan bo`lsa qator CHIQMAYDI', () => {
    for (const over of [{ debtAfterMinor: 0n }, { debtAfterMinor: null }, {}]) {
      const sale = SALE(over);
      expect(buildReceiptText(sale as never)).not.toContain('Sizning qarzingiz');
      expect(buildReceiptHtml(sale as never)).not.toContain('Sizning qarzingiz');
    }
  });

  it('🔴 qarz qatori ham 32 ustun chegarasida (printer o`ng chetini qirqmasin)', () => {
    const sale = SALE({ debtAfterMinor: 125000000n });
    for (const line of buildReceiptText(sale as never).split('\n')) {
      expect(line.length, `uzun qator: «${line}»`).toBeLessThanOrEqual(32);
    }
  });
});

/**
 * QARZ TO'LOVI CHEKI (2026-08-16, egasi) — tovar cheki shablonida.
 *
 * Server cheki `debtReceiptToSaleInput` orqali AYNI ikki renderer'dan o'tadi —
 * alohida «PKO» dizayni yo'q. Farqlar: sarlavha «QARZ TO'LOVI», qator nomi
 * «Qarz to'lovi», «Sizning qarzingiz» esa 0 bo'lsa HAM chiqadi (savdo chekida
 * chiqmaydi — yuqoridagi P05 bloki o'sha xulqni qulflab turadi).
 */
const DEBT_RECEIPT = (over: Record<string, unknown> = {}) =>
  debtReceiptToSaleInput({
    batchId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    counterparty: { id: 'cp-1', name: 'Alisher aka', phone: null },
    organization: { name: 'Sherset MChJ', legalTitle: null, phone: '+998908769900' },
    cashier: { id: 'u-1', name: 'Kassir Aliyev' },
    paidAt: '2026-08-15T05:30:00.000Z',
    method: 'cash',
    currency: 'UZS',
    originalMinor: null,
    exchangeRate: null,
    paidMinor: '8000000',
    outstandingAfterMinor: '4000000',
    lines: [{ debtId: 'd-1', debtName: 'QRZ-00012', amountMinor: '8000000', reversed: false }],
    ...over,
  });

describe('qarz to`lovi cheki — tovar cheki shablonida', () => {
  it('ikkala renderer sarlavha, qator nomi va ismlarni chiqaradi', () => {
    for (const out of [
      buildReceiptText(DEBT_RECEIPT() as never),
      buildReceiptHtml(DEBT_RECEIPT() as never),
    ]) {
      const s = flat(out);
      expect(s).toContain("QARZ TO'LOVI");
      expect(s).toContain("Qarz to'lovi");
      expect(s).toContain('Kassir Aliyev');
      expect(s).toContain('Alisher aka');
      expect(s).toContain('Sizning qarzingiz');
      expect(s).toContain('40 000');
    }
  });

  it('🔴 qoldiq 0 bo`lsa HAM «Sizning qarzingiz» chiqadi (qarz tugadi dalili)', () => {
    const paidOff = DEBT_RECEIPT({ outstandingAfterMinor: '0' });
    expect(buildReceiptText(paidOff as never)).toContain('Sizning qarzingiz');
    expect(buildReceiptHtml(paidOff as never)).toContain('Sizning qarzingiz');
  });

  it('matn cheki 32 ustundan oshmaydi (qarz chekida ham)', () => {
    for (const line of buildReceiptText(DEBT_RECEIPT() as never).split('\n')) {
      expect(line.length, `uzun qator: «${line}»`).toBeLessThanOrEqual(32);
    }
  });
});
