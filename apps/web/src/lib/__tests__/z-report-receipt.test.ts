/**
 * F11 — Z-hisobot chek modeli (sof funksiya).
 *
 * NEGA SOF MODUL: Z-hisobot uchta renderer'da chiqadi — React chop sahifasi,
 * Electron HTML va ESC/POS matn. Xotira «Ombor cheki uch renderer»: biri
 * o'zgarsa qolgani JIMGINA eskiradi. Shuning uchun raqam/NULL mantig'i shu
 * yerda BIR MARTA hisoblanadi, uch renderer esa tayyor `ZReceiptView` ni
 * chizadi.
 *
 * 🔴 NULL ≠ 0 (uch holat majburiy):
 *  · `null`  — sanalmagan / o'lchanmagan  → matn yorlig'i, raqam EMAS
 *  · `'0'`   — sanaldi va nol            → «0,00», «farq yo'q»
 *  · normal  — raqam
 *
 * Raqamlar SERVERDAN keladi (`GET /cashier-sessions/:id/z-report`) — bu modul
 * hech narsani QAYTA HISOBLAMAYDI, faqat formatlaydi.
 */

import { describe, expect, it } from 'vitest';
import {
  type ZReportPayload,
  buildZReceipt,
  renderZReceiptHtml,
  renderZReceiptText,
} from '../z-report-receipt';
import { Z_RECEIPT_LABELS_FIXTURE } from './z-receipt-labels-fixture';

const L = Z_RECEIPT_LABELS_FIXTURE;

function payload(over: Partial<ZReportPayload> = {}): ZReportPayload {
  return {
    session: {
      id: '33333333-3333-4333-8333-333333333333',
      state: 'closed',
      openedAt: '2026-08-09T04:00:00.000Z',
      closedAt: '2026-08-09T14:00:00.000Z',
      cashier: { id: 'u-1', name: 'Kassir Aliyev' },
      cashDesk: { id: 'cd-1', name: 'Asosiy kassa', currency: 'UZS' },
      store: { name: 'Markaziy do‘kon' },
      organization: { name: 'Sherset MChJ', legalTitle: 'MChJ «Sherset»' },
    },
    salesCount: 12,
    revenueMinor: '150000000',
    revenueByMethod: [
      { method: 'CASH_UZS', sumMinor: '100000000', currency: 'UZS', baseMinor: '100000000' },
      { method: 'CARD', sumMinor: '50000000', currency: 'UZS', baseMinor: '50000000' },
    ],
    unconvertedByMethod: [],
    averageReceiptMinor: '12500000',
    grossProfitMinor: '30000000',
    discountMinor: '2000000',
    creditSoldMinor: '5000000',
    debtPaidMinor: '3000000',
    returnsMinor: '1000000',
    expenseMinor: '700000',
    collectionMinor: '20000000',
    expenseByItem: [{ id: 'ei-1', name: 'Ijara', sumMinor: '700000' }],
    openingCashMinor: '10000000',
    expectedCashMinor: '92300000',
    countedCashMinor: '92300000',
    varianceMinor: '0',
    openingCashUsdMinor: '0',
    expectedUsdCashMinor: '10000',
    countedUsdCashMinor: '9500',
    varianceUsdMinor: '-500',
    variances: [],
    ...over,
  };
}

/**
 * `formatMoney` ru-RU ming ajratgichini — UZILMAS bo'shliqni (U+00A0) —
 * ishlatadi. Test satrida oddiy probel yozilsa taqqoslash sababsiz yiqilardi.
 */
function norm(text: string | undefined): string {
  return (text ?? '').replace(/[   ]/g, ' ');
}

/** Butun ko'rinishdagi «yorliq → qiymat» juftliklari (bo'lim farqi muhim emas). */
function pairs(view: ReturnType<typeof buildZReceipt>): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of view.header) out.set(r.label, norm(r.value));
  for (const s of view.sections) for (const r of s.rows) out.set(r.label, norm(r.value));
  return out;
}

describe('buildZReceipt — NULL/0/normal uch holati', () => {
  it('NORMAL: sanalgan naqd va farq raqam bo‘lib chiqadi', () => {
    const p = pairs(buildZReceipt(payload(), { labels: L, returnsCount: 2 }));

    expect(p.get(L.counted)).toBe('923 000,00');
    expect(p.get(L.expected)).toBe('923 000,00');
    // Farq 0 — «sanalmagan» EMAS.
    expect(p.get(L.variance)).toBe(L.noVariance);
    expect(p.get(L.countedUsd)).toBe('95,00');
    expect(p.get(L.varianceUsd)).toBe(`${L.shortage} 5,00`);
  });

  it('NULL: sanalmagan naqd «0» emas, matn yorlig‘i bilan chiqadi', () => {
    const view = buildZReceipt(
      payload({
        countedCashMinor: null,
        varianceMinor: null,
        countedUsdCashMinor: null,
        varianceUsdMinor: null,
        grossProfitMinor: null,
        averageReceiptMinor: null,
      }),
      { labels: L, returnsCount: null },
    );
    const p = pairs(view);

    expect(p.get(L.counted)).toBe(L.notCounted);
    expect(p.get(L.variance)).toBe(L.notCounted);
    expect(p.get(L.countedUsd)).toBe(L.notCounted);
    expect(p.get(L.varianceUsd)).toBe(L.notCounted);
    // Tan narx muzlatilmagan ⇒ yalpi foyda «0» emas, «o‘lchanmagan».
    expect(p.get(L.grossProfit)).toBe(L.notMeasured);
    expect(p.get(L.avgReceipt)).toBe(L.unknown);
    // Qaytarishlar soni manba bermasa — nol EMAS.
    expect(p.get(L.returns)).toContain(L.unknown);

    // 🔴 Sanalmagan qatorlarda raqam UMUMAN bo'lmasligi kerak.
    for (const label of [L.counted, L.variance, L.countedUsd, L.varianceUsd]) {
      expect(p.get(label)).not.toMatch(/\d/);
    }
  });

  it('NOL: sanaldi va nol — «sanalmagan» dan boshqacha chiqadi', () => {
    const p = pairs(
      buildZReceipt(
        payload({
          countedUsdCashMinor: '0',
          varianceUsdMinor: '0',
          expectedUsdCashMinor: '0',
          openingCashUsdMinor: '0',
          grossProfitMinor: '0',
        }),
        { labels: L, returnsCount: 0 },
      ),
    );

    expect(p.get(L.countedUsd)).toBe('0,00');
    expect(p.get(L.varianceUsd)).toBe(L.noVariance);
    expect(p.get(L.countedUsd)).not.toBe(L.notCounted);
    // Foyda haqiqatan nol — «o'lchanmagan» EMAS.
    expect(p.get(L.grossProfit)).toBe('0,00');
    expect(p.get(L.returns)).toContain('0');
  });
});

describe('buildZReceipt — raqamlar faqat serverdan', () => {
  it('tushum, cheklar soni va to‘lov turlari serverning maydonlaridan olinadi', () => {
    const view = buildZReceipt(payload(), { labels: L, returnsCount: 2 });
    const p = pairs(view);

    expect(p.get(L.revenue)).toBe('1 500 000,00');
    expect(p.get(L.receipts)).toBe('12');
    // To'lov turi — o'z valyutasi bilan (aralash valyutali smenada
    // sentni tiyin deb ko'rsatmaslik uchun).
    const tenders = view.sections.find((s) => s.title === L.tenders);
    expect(tenders?.rows.map((r) => r.label)).toEqual([L.tender.CASH_UZS, L.tender.CARD]);
    expect(norm(tenders?.rows[0]?.value)).toBe('1 000 000,00 UZS');
  });

  it('kursi yo‘q qatorlar jamiga qo‘shilmaydi, alohida bo‘limda turadi', () => {
    const view = buildZReceipt(
      payload({
        unconvertedByMethod: [{ method: 'CASH_USD', sumMinor: '10000', currency: 'USD' }],
      }),
      { labels: L, returnsCount: 0 },
    );
    const unconv = view.sections.find((s) => s.title === L.unconverted);
    expect(unconv).toBeDefined();
    expect(norm(unconv?.rows[0]?.value)).toBe('100,00 USD');
  });

  it('xarajat moddalari bo‘lmasa, bo‘lim umuman chizilmaydi', () => {
    const view = buildZReceipt(payload({ expenseByItem: [] }), { labels: L, returnsCount: 0 });
    expect(view.sections.find((s) => s.title === L.expenseByItem)).toBeUndefined();
  });
});

describe('renderZReceiptText / renderZReceiptHtml — uch renderer bitta modeldan', () => {
  it('matn renderer 32 ustunga sig‘adi va sanalmagan yorlig‘ini saqlaydi', () => {
    const view = buildZReceipt(payload({ countedCashMinor: null, varianceMinor: null }), {
      labels: L,
      returnsCount: 1,
    });
    const text = renderZReceiptText(view);

    expect(text).toContain(L.notCounted);
    expect(text).toContain('MChJ «Sherset»');
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });

  it('HTML renderer belgilardan qochadi (XSS/buzilgan razmetka bo‘lmaydi)', () => {
    const view = buildZReceipt(
      payload({
        session: {
          ...payload().session,
          organization: { name: '<script>x</script>', legalTitle: null },
        },
      }),
      { labels: L, returnsCount: 0 },
    );
    const html = renderZReceiptHtml(view);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
