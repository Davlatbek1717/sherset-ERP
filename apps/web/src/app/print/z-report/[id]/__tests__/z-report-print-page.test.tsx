/**
 * F11 — `/print/z-report/[id]` chop sahifasi.
 *
 * Qulflanadigan shartnomalar:
 *  1. Raqamlar SERVERDAN — sahifa `GET /cashier-sessions/:id/z-report` ni
 *     chaqiradi (aynan `/retail/sessions/[id]` ekrani ishlatadigan endpoint)
 *     va hech narsani qayta hisoblamaydi.
 *  2. Qaytarishlar SONI eski `/retail-sales/z-report?sessionId=` dan —
 *     ekran ham shundan oladi. Manba yo'q bo'lsa «—», nol EMAS.
 *  3. NULL ≠ 0 uch holati (sanalmagan / sanaldi-nol / normal).
 *  4. `?auto=1` — avto-chop (boshqa chop sahifalari naqshi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintZReportPage from '../page';

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

/** Serverning `zReport()` javobi — maydon nomlari aynan endpointdagidek. */
function zReport(over: Record<string, unknown> = {}) {
  return {
    session: {
      id: SESSION_ID,
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
    countedUsdCashMinor: null,
    varianceUsdMinor: null,
    variances: [],
    ...over,
  };
}

const LEGACY = { salesCount: 12, returnsCount: 2, returnsSumMinor: '1000000' };

function mockApi(z: Record<string, unknown> = zReport(), legacy: unknown = LEGACY) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === `/cashier-sessions/${SESSION_ID}/z-report`) return z;
    if (path.startsWith('/retail-sales/z-report')) {
      if (legacy instanceof Error) throw legacy;
      return legacy;
    }
    throw new Error(`Test jihozi: kutilmagan so'rov «${path}»`);
  });
}

/** `formatMoney` ming ajratgichi — uzilmas bo'shliq; taqqoslashdan oldin normallashtiriladi. */
function norm(text: string | null | undefined): string {
  return (text ?? '').replace(/[   ]/g, ' ');
}

/** `data-test-id="z-row-<kalit>"` qatorining qiymati. */
function rowValue(key: string): string {
  return norm(screen.getByTestId(`z-row-${key}`).textContent);
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('/print/z-report/[id] — manba va raqamlar', () => {
  it('raqamlarni serverning z-report endpointidan oladi (o‘zi hisoblamaydi)', async () => {
    mockApi();
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    expect(api.get).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/z-report`);
    // Qaytarishlar soni — ekran (`/retail/sessions/[id]`) ishlatadigan
    // eski endpointdan; yangi z-report'da bunday maydon yo'q.
    expect(api.get).toHaveBeenCalledWith(`/retail-sales/z-report?sessionId=${SESSION_ID}`);

    expect(rowValue('revenue')).toContain('1 500 000,00');
    expect(rowValue('receipts')).toContain('12');
    expect(rowValue('returns')).toContain('2');
    expect(rowValue('returns')).toContain('10 000,00');
  });

  it('qaytarishlar soni manbasi yiqilsa «—» chiqadi, 0 EMAS', async () => {
    mockApi(zReport(), new Error('500'));
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    await waitFor(() => expect(rowValue('returns')).toContain('—'));
    expect(rowValue('returns')).not.toMatch(/(^|\D)0 /);
  });
});

describe('/print/z-report/[id] — NULL ≠ 0 uch holati', () => {
  it('NULL: sanalmagan dollar «0» emas, «sanalmagan» deb chiqadi', async () => {
    mockApi(zReport({ countedUsdCashMinor: null, varianceUsdMinor: null }));
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    expect(rowValue('counted-usd')).toBe('sanalmagan');
    expect(rowValue('variance-usd')).toBe('sanalmagan');
    expect(rowValue('counted-usd')).not.toMatch(/\d/);
  });

  it('NOL: sanalgan va nol dollar — raqam bo‘lib chiqadi', async () => {
    mockApi(zReport({ countedUsdCashMinor: '0', varianceUsdMinor: '0' }));
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    expect(rowValue('counted-usd')).toBe('0,00');
    expect(rowValue('variance-usd')).toBe("farq yo'q");
  });

  it('NORMAL: sanalgan dollar va farq raqam bo‘lib chiqadi', async () => {
    mockApi(zReport({ countedUsdCashMinor: '9500', varianceUsdMinor: '-500' }));
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    expect(rowValue('counted-usd')).toBe('95,00');
    expect(rowValue('variance-usd')).toContain('5,00');
    expect(rowValue('variance-usd')).toContain('kamomad');
  });

  it('tan narx muzlatilmagan bo‘lsa yalpi foyda «o‘lchanmagan», 0 EMAS', async () => {
    mockApi(zReport({ grossProfitMinor: null }));
    renderWithProviders(<PrintZReportPage />);

    await screen.findByTestId('z-receipt');
    expect(rowValue('gross-profit')).toBe("o'lchanmagan");
  });
});

describe('/print/z-report/[id] — chop etish xulqi', () => {
  it('?auto=1 bo‘lsa avto-chop otiladi', async () => {
    searchParams = new URLSearchParams('auto=1');
    const print = vi.fn();
    vi.stubGlobal('print', print);
    window.print = print;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi();
      renderWithProviders(<PrintZReportPage />);
      await screen.findByTestId('z-receipt');
      await vi.advanceTimersByTimeAsync(1000);
      expect(print).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('auto parametri bo‘lmasa avto-chop otilmaydi', async () => {
    const print = vi.fn();
    window.print = print;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi();
      renderWithProviders(<PrintZReportPage />);
      await screen.findByTestId('z-receipt');
      await vi.advanceTimersByTimeAsync(1000);
      expect(print).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
