import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintRetailSalePage from './page';

/**
 * F5 — chekning UCHINCHI renderer'i (brauzer, `/print/retail-sale/:id`).
 *
 * Matnli/HTML renderer'lar bilan BIR manbadan (`receiptPaymentLines`) oziqlanadi;
 * bu test aynan shuni qulflaydi — ilgari bu sahifa faqat `cashAmountMinor` va
 * `cardAmountMinor` ni chizardi, ya'ni terminal · qarz · dollar chekda umuman
 * ko'rinmasdi (xotira: «ombor cheki uch renderer»).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's-1' }),
  useSearchParams: () => new URLSearchParams(''),
}));

const SALE = (over: Record<string, unknown> = {}) => ({
  id: 's-1',
  name: 'CHEK-00042',
  state: 'posted',
  moment: '2026-08-11T05:30:00.000Z',
  sumMinor: '15000000',
  cashAmountMinor: '0',
  cardAmountMinor: '0',
  changeMinor: '0',
  description: null,
  agent: null,
  session: {
    cashDesk: { name: 'Asosiy kassa', currency: 'UZS' },
    cashier: { name: 'Kassir Aliyev' },
    store: { name: 'Markaziy dokon' },
    organization: { name: 'Sherset MChJ', legalTitle: null },
  },
  positions: [
    {
      id: 'pos-1',
      position: 1,
      quantity: '1',
      priceMinor: '15000000',
      discount: '0',
      sumMinor: '15000000',
      product: { id: 'p-1', name: 'Kabel', code: 'K-1', uom: null },
    },
  ],
  payments: [],
  ...over,
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('/print/retail-sale — to‘lov qatlami', () => {
  it('dollar, terminal va qarz qatorlarini chiqaradi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SALE({
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
      }),
    );
    renderWithProviders(<PrintRetailSalePage />);

    await waitFor(() => expect(screen.getByText('Naqd')).toBeInTheDocument());
    expect(screen.getByText('Dollar')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    // Muzlatilgan kurs chekda ko'rinadi — mijoz nima bo'yicha hisoblanganini bilsin.
    expect(screen.getByText(/12450\.27/)).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Qarz')).toBeInTheDocument();
  });

  it('eski chekda (to‘lov qatorlari yo‘q) legacy ustunlar chiziladi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      SALE({ payments: [], cashAmountMinor: '8000000', cardAmountMinor: '7000000' }),
    );
    renderWithProviders(<PrintRetailSalePage />);

    await waitFor(() => expect(screen.getByText('Naqd')).toBeInTheDocument());
    expect(screen.getByText('Karta')).toBeInTheDocument();
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  });
});
