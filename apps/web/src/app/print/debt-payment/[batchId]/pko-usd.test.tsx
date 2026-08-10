import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintDebtPaymentPage from './page';

/**
 * F6 — PKO cheki (qarz to'lovi) DOLLAR qatori.
 *
 * Chek MOLIYAVIY hujjat: mijoz nechta dollar berganini va QAYSI KURS bo'yicha
 * hisoblanganini o'qishi shart. Busiz «qarzim nega shuncha kamaydi» bahsini
 * yechib bo'lmaydi — kurs ertaga o'zgaradi, chek esa muzlatilgan qiymatni
 * ko'rsatishi kerak.
 *
 * Yorliq/format `receipt-payments.ts` dan (savdo cheki bilan BITTA lug'at) —
 * xotira: «ombor cheki uch renderer», nusxa jimgina eskiradi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ batchId: 'b-1' }),
  useSearchParams: () => new URLSearchParams(''),
}));

const RECEIPT = (over: Record<string, unknown> = {}) => ({
  batchId: 'b-1',
  counterparty: { id: 'cp-1', name: 'Alisher', phone: null },
  organization: { name: 'Sherset MChJ', legalTitle: null },
  cashier: { id: 'u-1', name: 'Kassir Aliyev' },
  paidAt: '2026-08-11T05:30:00.000Z',
  method: 'cash',
  currency: 'UZS',
  originalMinor: null,
  exchangeRate: null,
  paidMinor: '124502700',
  outstandingAfterMinor: '0',
  lines: [{ debtId: 'd-1', debtName: 'QRZ-1', amountMinor: '124502700', reversed: false }],
  ...over,
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('PKO cheki — dollar qatori (F6)', () => {
  it('dollar to`lovida ASL summa va MUZLATILGAN kurs chiqadi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      RECEIPT({ currency: 'USD', originalMinor: '10000', exchangeRate: '1245027000000' }),
    );
    renderWithProviders(<PrintDebtPaymentPage />);

    const line = await screen.findByTestId('pko-usd-line');
    expect(line).toHaveTextContent('$100.00');
    expect(line).toHaveTextContent('12450.27');
    // So'mdagi jami hamon ko'rinadi — qarz daftari shu qiymatda kamaydi.
    await waitFor(() => expect(screen.getByText(/TO'LANDI/)).toBeInTheDocument());
  });

  it('so`m to`lovida dollar qatori YO`Q (bo`sh qator chizilmaydi)', async () => {
    vi.mocked(api.get).mockResolvedValue(RECEIPT());
    renderWithProviders(<PrintDebtPaymentPage />);

    await waitFor(() => expect(screen.getByText(/TO'LANDI/)).toBeInTheDocument());
    expect(screen.queryByTestId('pko-usd-line')).toBeNull();
  });

  it('kurs yo`q buzuq qatorda chek YO`QOLMAYDI (dollar qatori tushiriladi)', async () => {
    // Eski (F6'gacha) USD qatori: valyuta bor, kurs yo'q. Chek baribir bosiladi.
    vi.mocked(api.get).mockResolvedValue(
      RECEIPT({ currency: 'USD', originalMinor: '10000', exchangeRate: null }),
    );
    renderWithProviders(<PrintDebtPaymentPage />);

    await waitFor(() => expect(screen.getByText(/TO'LANDI/)).toBeInTheDocument());
    expect(screen.queryByTestId('pko-usd-line')).toBeNull();
  });
});
