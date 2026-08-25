/**
 * Chek NEGA o'ngga surilib, «Summa» ustuni qog'ozdan chiqib ketdi (2026-08-14,
 * egasining fotosi: TPH-2026-00073).
 *
 * Ildiz sabab — IKKI qavatli kenglik xatosi:
 *  1. Exe sukut sahifani 80mm deb e'lon qiladi (main.js DEFAULT_WIDTH_MICRONS),
 *     lekin 80mm termal printerning BOSILADIGAN eni ~72mm. Drayver 72mm'dan
 *     tashqarisini KESADI (masshtablamaydi).
 *  2. HTML body 72mm bo'lib, 80mm sahifada `margin:0 auto` bilan MARKAZGA
 *     olingan — ya'ni chapdan ~4mm siljish, o'ngdan esa oxirgi ~4mm (Summa
 *     raqamlari) bosiladigan hududdan tashqariga tushardi.
 *
 * Shartnoma (shu test qulflaydi):
 *  - Uchala Electron-HTML renderer body'si `width:72mm;margin:0` — markazlash YO'Q.
 *  - printSheet chaqiruvlariga sahifa eni OSHKORA beriladi: `{ width: 72000 }`
 *    (mikron, balandliksiz — exe v1.0.3+ balandlikni mazmundan o'zi o'lchaydi,
 *    1.4.0 dagi `resolvePageSize` shu shaklni qo'llab-quvvatlashi git'dan
 *    tasdiqlangan). Shunda drayverga 80mm emas, aynan bosiladigan 72mm boradi.
 */

import { api } from '@/lib/api-client';
import {
  THERMAL_PAGE_MICRONS,
  buildReceiptHtml,
  buildSheetHtml,
  printPickingViaAgent,
  printReceiptViaAgent,
  printZReportViaAgent,
} from '@/lib/print-agent';
import { buildZReceipt, renderZReceiptHtml } from '@/lib/z-report-receipt';
import type { ZReceiptLabels, ZReportPayload } from '@/lib/z-report-receipt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

function installShell(
  printSheet = vi.fn(
    async (_printerName: string, _html: string, _page?: { width: number; height?: number }) => ({
      ok: true,
    }),
  ),
) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isSherset: true,
    version: '1.4.0',
    listPrinters: async () => ['XP-80C'],
    printSheet,
  };
  return printSheet;
}

const SALE = {
  name: 'CHEK-1',
  moment: '2026-08-13T10:00:00.000Z',
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

// printZReportViaAgent to'liq yorliq talab qiladi; qiymatlar bu testda muhim emas.
const Z_LABELS = {
  title: 'Z',
  shiftNo: 's',
  opened: 'o',
  closed: 'c',
  cashier: 'k',
  tenders: 't',
  unconverted: 'u',
  summary: 'j',
  revenue: 'r',
  receipts: 'ch',
  avgReceipt: 'a',
  grossProfit: 'g',
  discount: 'd',
  creditSold: 'cs',
  debtPaid: 'dp',
  returns: 'rt',
  expense: 'e',
  collection: 'col',
  returnPayout: 'rp',
  prepay: 'pp',
  prepaySpent: 'ps',
  prepayRefund: 'pr',
  expenseByItem: 'ei',
  expenseNoItem: 'en',
  cashBlockUzs: 'cu',
  cashBlockUsd: 'cd',
  opening: 'op',
  expected: 'ex',
  counted: 'cn',
  variance: 'v',
  openingUsd: 'ou',
  expectedUsd: 'eu',
  countedUsd: 'cu2',
  varianceUsd: 'vu',
  notCounted: 'nc',
  notMeasured: 'nm',
  unknown: '—',
  noVariance: 'nv',
  shortage: 'sh',
  surplus: 'su',
  pcs: 'p',
  tender: {},
} satisfies ZReceiptLabels;

const Z_PAYLOAD: ZReportPayload = {
  session: {
    id: 'sess-1',
    state: 'CLOSED',
    openedAt: '2026-08-13T08:00:00.000Z',
    closedAt: '2026-08-13T20:00:00.000Z',
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
  returnPayoutMinor: '0',
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

const AGENT_SHEET = {
  skladNo: 1,
  lines: [{ productName: 'Viko shit 12x', uom: 'шт', quantity: '12', binLocation: 'A-1' }],
};
const AGENT_RES = {
  docNumber: 'TPH-1',
  docDate: '2026-08-13',
  sourceName: 'TPH-1',
  sellerName: 'Org',
  buyerName: 'Mijoz',
  buyerPhone: '',
  comment: '',
  sheets: [AGENT_SHEET],
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

afterEach(() => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  vi.unstubAllGlobals();
});

describe('72mm bosiladigan-en shartnomasi — HTML renderlar', () => {
  it("uchala renderer body'si markazlashsiz 72mm (margin:0, auto EMAS)", () => {
    const receipts = [
      buildReceiptHtml(SALE as never),
      buildSheetHtml(AGENT_SHEET as never, AGENT_RES as never),
      renderZReceiptHtml(buildZReceipt(Z_PAYLOAD, { labels: Z_LABELS, returnsCount: 0 })),
    ];
    for (const html of receipts) {
      expect(html).toContain('body{width:72mm;margin:0;');
      expect(html).not.toContain('margin:0 auto');
    }
  });
});

describe('72mm bosiladigan-en shartnomasi — printSheet chaqiruvlari', () => {
  it('savdo cheki: printSheet uchinchi argument sifatida {width:72000} oladi', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockResolvedValue(SALE);

    const r = await printReceiptViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, ok: true });
    // Literal solishtirish — konstanta importi undefined bo'lsa ham test
    // VAKUUM bo'lib qolmasin (xotira: tz-label-test-vacuous).
    expect(printSheet.mock.calls[0]?.[2]).toEqual({ width: 72000 });
    expect(THERMAL_PAGE_MICRONS).toEqual({ width: 72000 });
  });

  it('Z-hisobot: printSheet {width:72000} bilan chaqiriladi', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockResolvedValue(Z_PAYLOAD);

    const r = await printZReportViaAgent('sess-1', Z_LABELS);

    expect(r).toMatchObject({ handled: true, ok: true });
    expect(printSheet.mock.calls[0]?.[2]).toEqual({ width: 72000 });
  });

  it('ombor varag`i: printSheet {width:72000} bilan chaqiriladi', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/restock-tasks/picking-sheets/')) return AGENT_RES;
      if (url.startsWith('/sklad-keepers'))
        return { items: [{ skladNo: 1, printerName: 'XP-80C' }] };
      throw new Error(`kutilmagan url: ${url}`);
    });

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, printed: 1 });
    expect(printSheet.mock.calls[0]?.[2]).toEqual({ width: 72000 });
  });
});
