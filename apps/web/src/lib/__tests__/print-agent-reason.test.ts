/**
 * P7 — chop zanjiri QAYSI qavatda uzilganini aytadi.
 *
 * Ilgari uchala uzilish ham bir xil `{ handled:false, ok:false }` qaytarardi:
 * agent yo'qmi, printer sozlanmaganmi, ma'lumot yuklanmadimi — chaqiruvchi
 * ajrata olmasdi va hammasiga bitta javob berardi (brauzer popup'i).
 * Qobiq ichida o'sha popup Chromium tasdiq oynasini chiqaradi — egasi ko'rgan
 * simptom aynan shu. `reason` shu ajratishni beradi.
 *
 * B3 (2026-08-12): «printer sozlanmagan» qavati BUTUNLAY yo'qoldi — chek ham,
 * Z-hisobot ham qurilmaning Windows sukut printeriga bosiladi va akkaunt
 * sozlamasi o'qilmaydi. Shuning uchun bu yerdagi qulf endi teskari yo'nalishda
 * ishlaydi: `/sklad-keepers` chaqirilsa test YIQILADI.
 */

import { api } from '@/lib/api-client';
import { printReceiptViaAgent, printZReportViaAgent } from '@/lib/print-agent';
import type { ZReceiptLabels, ZReportPayload } from '@/lib/z-report-receipt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

/**
 * To'liq yorliq to'plami — QISQARTIRILMAYDI.
 *
 * Ilgari bu yerda 5 maydonli `as unknown as` kasti turardi: test chop
 * renderergacha YETIB BORMASDI (funksiya undan oldin `printer-not-set` bilan
 * qaytardi), shuning uchun chala fixture bilinmasdi. B3'dan keyin yo'l oxirigacha
 * boradi va yetishmagan yorliq `escapeHtml(undefined)` da yiqiladi. Tip
 * annotatsiyasi (kast EMAS) — yangi yorliq qo'shilsa typecheck shu yerni ko'rsatadi.
 */
const LABELS: ZReceiptLabels = {
  title: 'Z-hisobot',
  shiftNo: 'Smena',
  opened: 'Ochildi',
  closed: 'Yopildi',
  cashier: 'Kassir',
  tenders: "To'lov turlari",
  unconverted: 'Konvertatsiya qilinmagan',
  summary: 'Jami',
  revenue: 'Tushum',
  receipts: 'Cheklar',
  avgReceipt: "O'rtacha chek",
  grossProfit: 'Yalpi foyda',
  discount: 'Chegirma',
  creditSold: 'Qarzga sotildi',
  debtPaid: "Qarz to'landi",
  returns: 'Qaytarishlar',
  expense: 'Xarajat',
  collection: 'Inkassatsiya',
  expenseByItem: 'Xarajat moddalari',
  expenseNoItem: 'Moddasiz',
  cashBlockUzs: 'Naqd (UZS)',
  cashBlockUsd: 'Naqd (USD)',
  opening: 'Boshlang‘ich',
  expected: 'Kutilgan',
  counted: 'Sanalgan',
  variance: 'Farq',
  openingUsd: 'Boshlang‘ich USD',
  expectedUsd: 'Kutilgan USD',
  countedUsd: 'Sanalgan USD',
  varianceUsd: 'Farq USD',
  notCounted: 'sanalmagan',
  notMeasured: "o'lchanmagan",
  unknown: '—',
  noVariance: "farq yo'q",
  shortage: 'kamomad',
  surplus: 'ortiqcha',
  pcs: 'dona',
  tender: { CASH_UZS: 'Naqd (so‘m)' },
};

/**
 * Qobiq (Electron) ko'prigini o'rnatadi — `printSheet` jim chop qiladi.
 *
 * B3'dan keyin `version` chop yo'liga TA'SIR QILMAYDI (B2 versiya darvozasi
 * olib tashlandi) — u faqat ko'prikning haqiqiy shakliga sodiq qolish uchun
 * turibdi.
 */
function installShell(
  version = '1.4.0',
  // Parametrlar ataylab tiplangan: `printSheet.mock.calls[0][0]` (qaysi printer
  // nomi uzatildi) shusiz tipsiz bo'sh kortej bo'lib qoladi.
  printSheet = vi.fn(async (_printerName: string, _html: string) => ({ ok: true })),
) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isSherset: true,
    version,
    listPrinters: async () => ['XP-80C'],
    printSheet,
  };
  return printSheet;
}

/**
 * `/sklad-keepers` chaqirilishi B3'dan keyin BUG — akkaunt-darajali chek
 * printeri sozlamasi yo'q. Shu sababli mock uni jimgina qaytarmaydi, balki
 * OTADI: aks holda regressiya `printSheet('')` bilan ustma-ust tushib
 * ko'rinmay qolardi.
 */
function apiGetOrThrowOnSettings(payload: unknown) {
  return vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/sklad-keepers')) throw new Error('/sklad-keepers chaqirildi');
    return payload;
  });
}

const SALE = {
  name: 'CHEK-1',
  moment: '2026-08-11T10:00:00.000Z',
  sumMinor: '1000',
  cashAmountMinor: '1000',
  cardAmountMinor: '0',
  changeMinor: '0',
  description: null,
  agent: null,
  session: {
    cashDesk: { name: 'Kassa' },
    cashier: { name: 'Kassir' },
    store: null,
    organization: { name: 'Org', legalTitle: null },
  },
  positions: [],
};

const Z_PAYLOAD: ZReportPayload = {
  session: {
    id: 'sess-1',
    state: 'CLOSED',
    openedAt: '2026-08-11T08:00:00.000Z',
    closedAt: '2026-08-11T20:00:00.000Z',
    cashier: { id: 'c-1', name: 'Kassir' },
    cashDesk: { id: 'cd-1', name: 'Kassa', currency: 'UZS' },
    store: null,
    organization: { name: 'Org', legalTitle: null },
  },
  salesCount: 0,
  revenueMinor: '0',
  revenueByMethod: [],
  unconvertedByMethod: [],
  averageReceiptMinor: null,
  grossProfitMinor: null,
  discountMinor: '0',
  creditSoldMinor: '0',
  debtPaidMinor: '0',
  returnsMinor: '0',
  expenseMinor: '0',
  collectionMinor: '0',
  expenseByItem: [],
  openingCashMinor: '0',
  expectedCashMinor: '0',
  countedCashMinor: null,
  varianceMinor: null,
  openingCashUsdMinor: '0',
  expectedUsdCashMinor: '0',
  countedUsdCashMinor: null,
  varianceUsdMinor: null,
  variances: [],
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

afterEach(() => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  vi.unstubAllGlobals();
});

describe('printReceiptViaAgent — uzilish sababi', () => {
  it('agent ham, qobiq ham yo‘q ⇒ reason=no-agent (so‘rov ham yuborilmaydi)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: false, reason: 'no-agent' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('ma’lumot yuklanmadi ⇒ reason=load-failed', async () => {
    installShell();
    vi.mocked(api.get).mockRejectedValue(new Error('500'));

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: false, reason: 'load-failed' });
  });

  it('B3 — sozlama O`QILMAYDI, bo`sh nom (= sukut printer) bilan JIM chop', async () => {
    const printSheet = installShell();
    apiGetOrThrowOnSettings(SALE);

    const r = await printReceiptViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, ok: true });
    expect(r.reason).toBeUndefined();
    expect(printSheet).toHaveBeenCalledTimes(1);
    // 🔴 Bo'sh nom — «Windows sukut printeri» shartnomasi (desktop v1.4.0+).
    // Uchinchi argument — 72mm bosiladigan-en (receipt-print-width.test.ts qulfi).
    expect(printSheet).toHaveBeenCalledWith('', expect.stringContaining('CHEK-1'), {
      width: 72000,
    });
  });

  it('B3 — eski qobiqda ham AYNI yo`l (versiya darvozasi yo`q)', async () => {
    const printSheet = installShell('1.3.0');
    apiGetOrThrowOnSettings(SALE);

    const r = await printReceiptViaAgent('s-1');

    expect(r.handled).toBe(true);
    expect(printSheet.mock.calls[0]?.[0]).toBe('');
  });
});

/**
 * P05 (2026-08-13, egasi) — kontragentli chekda «Sizning qarzingiz» qatori.
 *
 * Agent-yo'l chekni O'ZI yuklaydi, shuning uchun qarz qoldig'i ham shu yerda
 * so'raladi (`/debts/pos/summary/:agentId?currency=UZS` → payableMinor).
 * So'rov yiqilsa chek BARIBIR bosiladi (fail-open) — chek to'xtamasin.
 */
describe('printReceiptViaAgent — mijoz qarzi (P05)', () => {
  const SALE_WITH_AGENT = {
    ...SALE,
    agent: { id: 'agent-1', name: 'Zikrillo aka', legalTitle: null },
  };

  it('kontragentli chek: summary so`raladi va qator HTML da bosiladi', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/debts/pos/summary/agent-1')) return { payableMinor: '125000000' };
      return SALE_WITH_AGENT;
    });

    const r = await printReceiptViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, ok: true });
    expect(api.get).toHaveBeenCalledWith('/debts/pos/summary/agent-1?currency=UZS');
    expect(printSheet.mock.calls[0]?.[1]).toContain('Sizning qarzingiz');
  });

  it('summary yiqilsa chek BARIBIR bosiladi (fail-open), qator yo`q', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/debts/pos/summary/')) throw new Error('500');
      return SALE_WITH_AGENT;
    });

    const r = await printReceiptViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, ok: true });
    expect(printSheet.mock.calls[0]?.[1]).not.toContain('Sizning qarzingiz');
  });

  it('kontragentsiz chekda summary UMUMAN so`ralmaydi', async () => {
    installShell();
    apiGetOrThrowOnSettings(SALE);

    await printReceiptViaAgent('s-1');

    const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/debts/'))).toBe(false);
  });
});

describe('printZReportViaAgent — uzilish sababi', () => {
  it('B3 — Z-hisobot ham sozlamani O`QIMAYDI, bo`sh nom bilan bosiladi', async () => {
    const printSheet = installShell();
    apiGetOrThrowOnSettings(Z_PAYLOAD);

    const r = await printZReportViaAgent('sess-1', LABELS);

    expect(r).toMatchObject({ handled: true, ok: true });
    expect(printSheet.mock.calls[0]?.[0]).toBe('');
  });

  it('ma’lumot yuklanmadi ⇒ reason=load-failed', async () => {
    installShell();
    vi.mocked(api.get).mockRejectedValue(new Error('500'));

    const r = await printZReportViaAgent('sess-1', LABELS);
    expect(r).toMatchObject({ handled: false, reason: 'load-failed' });
  });
});
