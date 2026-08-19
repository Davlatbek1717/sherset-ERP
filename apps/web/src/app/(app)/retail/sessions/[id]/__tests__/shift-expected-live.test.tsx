/**
 * OCHIQ smenada «Kassada hozir bo'lishi kerak» — jonli hisob va uning tarkibi.
 *
 * 🔴 Jonli hodisa (egasi, 2026-08-19, chek №EA8E779A): kassir 20 000 000
 * so'mlik naqd qarz to'lovini qabul qildi. Ma'lumot TO'G'RI yozildi —
 * `DebtPayment.retailShiftId` smenaga bog'landi, pul daftariga kirdi, kassa
 * balansi oshdi va server formulasi (`collectCashInputs`) uni kutilgan naqdga
 * qo'shdi ham. Lekin ekranda bu blok FAQAT `state === 'closed'` da chizilardi:
 * smena yopilmaguncha «bo'lishi kerak bo'lgan summa» hech qayerda ko'rinmasdi,
 * ya'ni qabul qilingan qarz puli «yo'qolgandek» tuyulardi.
 *
 * Qulflanadigan shartnomalar:
 *  1. ochiq smenada blok CHIZILADI va naqd qarz to'lovi alohida qator bo'ladi;
 *  2. jami — serverning `cashBreakdown.sumMinor` i (ekran qayta HISOBLAMAYDI);
 *  3. kassirning O'ZIGA ko'rsatilmaydi — smena yopish sanog'i yopiq (F5/Q7);
 *  4. kiosk foydalanuvchiga ko'rsatilmaydi (ayni sabab).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionDetailPage from '../page';

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

/** Pul formati bo'linmas probel ishlatadi — solishtirishdan oldin tekislanadi. */
const norm = (v: string | null) => (v ?? '').replace(/[   ]/g, ' ');
const CASHIER_ID = 'emp-kassir-1';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
}));

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

/** Kim qarayapti — har testda almashadi (kiosk / kassirning o'zi / menejer). */
let viewer: { id: string; uiMode?: 'full' | 'kiosk' } = { id: 'menejer-1', uiMode: 'full' };

vi.mock('@/lib/auth-store', () => ({
  isKioskUser: (u: { uiMode?: string } | null) => u?.uiMode === 'kiosk',
  useAuth: () => ({ user: viewer, accessToken: 't', initialized: true }),
  getAccessToken: () => 't',
  refresh: async () => false,
}));

function sessionRow(state: 'open' | 'closed' = 'open') {
  return {
    id: SESSION_ID,
    state,
    openedAt: '2026-08-19T04:36:00.000Z',
    closedAt: state === 'closed' ? '2026-08-19T14:00:00.000Z' : null,
    openingCashMinor: '5500000',
    closingCashMinor: null,
    expectedCashMinor: null,
    discrepancyMinor: null,
    cashier: { id: CASHIER_ID, name: 'Kassir Aliyev' },
    cashDesk: { id: 'cd-1', name: 'Asosiy kassa', currency: 'UZS' },
    store: { id: 'st-1', name: 'Markaziy do‘kon' },
    organization: { id: 'org-1', name: 'Sherset MChJ' },
    salesCount: 4,
    salesSumMinor: '2403600000',
    returnsCount: 0,
    returnsSumMinor: '0',
    externalCode: null,
  };
}

/** Serverning `zReport()` javobi — jonli hodisadagi raqamlar bilan. */
function zFull() {
  return {
    session: { id: SESSION_ID, state: 'open' },
    salesCount: 4,
    revenueMinor: '2403600000',
    revenueByMethod: [{ method: 'CASH', sumMinor: '370000000', currency: 'UZS', baseMinor: null }],
    unconvertedByMethod: [],
    averageReceiptMinor: '600900000',
    grossProfitMinor: null,
    discountMinor: '0',
    creditSoldMinor: '0',
    debtPaidMinor: '3000000000',
    returnsMinor: '0',
    expenseMinor: '0',
    collectionMinor: '0',
    expenseByItem: [],
    basis: 'live',
    openingCashMinor: '5500000',
    cashBreakdown: {
      openingMinor: '5500000',
      salesCashMinor: '370000000',
      debtCashMinor: '3000000000',
      drawerInMinor: '0',
      drawerOutMinor: '0',
      returnsCashMinor: '0',
      sumMinor: '3375500000',
    },
    expectedCashMinor: '3375500000',
    countedCashMinor: null,
    varianceMinor: null,
    variances: [],
  };
}

function mountRoutes(over: { state?: 'open' | 'closed' } = {}) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    // 🔴 Tartib MUHIM: `/cashier-sessions/:id/...` ostidagi yo'llar AVVAL
    // tekshiriladi. Aks holda `/…/drawer` ham smena qatorini olib, sahifa
    // `drawerOps.cashIn.length` da yiqilardi (yarim fixture klassi).
    if (path.includes('/cashier-sessions/') && path.endsWith('/z-report')) return zFull();
    if (path.includes('/cashier-sessions/') && path.endsWith('/drawer')) {
      return { cashIn: [], cashOut: [] };
    }
    if (path.startsWith('/cashier-sessions/')) return sessionRow(over.state ?? 'open');
    if (path.startsWith('/retail-sales/z-report')) {
      // Eski Z-hisobot endpointi — sahifa undagi HAR bir summani `BigInt` ga
      // o'giradi, shuning uchun fixture to'liq bo'lishi shart (yarim fixture
      // «Cannot convert undefined to a BigInt» bilan sahifani yiqitadi).
      return {
        session: {
          id: SESSION_ID,
          state: 'open',
          openedAt: '2026-08-19T04:36:00.000Z',
          closedAt: null,
          cashier: { name: 'Kassir Aliyev' },
          cashDesk: { name: 'Asosiy kassa', currency: 'UZS' },
          store: { name: 'Markaziy do‘kon' },
          organization: { name: 'Sherset MChJ' },
          openingCashMinor: '5500000',
          closingCashMinor: null,
          expectedCashMinor: null,
          discrepancyMinor: null,
        },
        salesCount: 4,
        salesSumMinor: '2403600000',
        cashSalesMinor: '370000000',
        cardSalesMinor: '2033600000',
        returnsCount: 0,
        returnsSumMinor: '0',
        cashReturnsMinor: '0',
        cardReturnsMinor: '0',
        netSumMinor: '2403600000',
      };
    }
    // Yashiq amallari / cheklar ro'yxati — bu test uchun ahamiyatsiz.
    return { items: [], cashIn: [], cashOut: [] };
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  viewer = { id: 'menejer-1', uiMode: 'full' };
});

describe('Ochiq smena — «kassada bo‘lishi kerak» jonli bloki', () => {
  it('🔴 naqd qarz to‘lovi ALOHIDA qator bo‘lib ko‘rinadi', async () => {
    mountRoutes();
    renderWithProviders(<SessionDetailPage />);

    const cell = await screen.findByTestId('shift-expected-debt-cash');
    expect(norm(cell.textContent)).toContain('30 000 000,00');
  });

  it('jami — serverning tarkib yig‘indisi (ekran qayta hisoblamaydi)', async () => {
    mountRoutes();
    renderWithProviders(<SessionDetailPage />);

    const block = await screen.findByTestId('shift-expected-live');
    // 3 375 500 000 tiyin = 33 755 000 so'm.
    expect(norm(block.textContent)).toContain('33 755 000,00');
  });

  it('kassirning O‘ZIGA ko‘rsatilmaydi (yopiq sanoq buzilmasin)', async () => {
    viewer = { id: CASHIER_ID, uiMode: 'full' };
    mountRoutes();
    renderWithProviders(<SessionDetailPage />);

    await screen.findByText('Kassir Aliyev');
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('shift-expected-live')).not.toBeInTheDocument();
  });

  it('kiosk foydalanuvchiga ko‘rsatilmaydi', async () => {
    viewer = { id: 'boshqa-kassir', uiMode: 'kiosk' };
    mountRoutes();
    renderWithProviders(<SessionDetailPage />);

    await screen.findByText('Kassir Aliyev');
    expect(screen.queryByTestId('shift-expected-live')).not.toBeInTheDocument();
  });

  it('YOPILGAN smenada jonli blok chizilmaydi — muzlatilgan hujjat qoladi', async () => {
    mountRoutes({ state: 'closed' });
    renderWithProviders(<SessionDetailPage />);

    await screen.findByText('Kassir Aliyev');
    expect(screen.queryByTestId('shift-expected-live')).not.toBeInTheDocument();
  });
});
