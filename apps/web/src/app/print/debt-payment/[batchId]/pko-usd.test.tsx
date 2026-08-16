import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintDebtPaymentPage from './page';

/**
 * Qarz to'lovi chekining ZAXIRA (brauzer) sahifasi — 2026-08-16 dan TOVAR
 * CHEKI shablonida (`TovarChek`), eski «PKO» dizayni emas. Haqiqiy chop odatda
 * agent/Electron orqali jim ketadi; bu sahifa faqat qobiq o'lik bo'lganda va
 * qayta chop etishda ochiladi — dizayn UCHALA yo'lda bir xil bo'lishi shart
 * (xotira: `ombor-chek-uch-renderer`).
 *
 * F6 (dollar qatori) shartnomasi saqlanadi: mijoz nechta dollar berganini va
 * QAYSI muzlatilgan kurs bo'yicha hisoblanganini chekdan o'qiy oladi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ batchId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
  useSearchParams: () => new URLSearchParams(''),
}));

const RECEIPT = (over: Record<string, unknown> = {}) => ({
  batchId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  counterparty: { id: 'cp-1', name: 'Alisher aka', phone: null },
  organization: { name: 'Sherset MChJ', legalTitle: null, phone: '+998908769900' },
  cashier: { id: 'u-1', name: 'Kassir Aliyev' },
  paidAt: '2026-08-15T05:30:00.000Z',
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

describe('qarz cheki (zaxira sahifa) — tovar cheki shablonida', () => {
  it('sarlavha, sotuvchi/mijoz ismlari va «Qarz to`lovi» qatori chiqadi', async () => {
    vi.mocked(api.get).mockResolvedValue(RECEIPT({ outstandingAfterMinor: '4000000' }));
    renderWithProviders(<PrintDebtPaymentPage />);

    await screen.findByTestId('tovar-chek');
    expect(screen.getByText(/QARZ TO'LOVI № A1B2C3D4/)).toBeInTheDocument();
    expect(screen.getByText(/Kassir Aliyev/)).toBeInTheDocument();
    expect(screen.getByText(/Alisher aka/)).toBeInTheDocument();
    expect(screen.getByText("Qarz to'lovi")).toBeInTheDocument();
  });

  it('«Sizning qarzingiz» = qoldiq, 0 bo`lsa HAM ko`rinadi (qarz tugadi dalili)', async () => {
    vi.mocked(api.get).mockResolvedValue(RECEIPT());
    renderWithProviders(<PrintDebtPaymentPage />);

    const row = await screen.findByTestId('chek-debt-after');
    expect(row).toHaveTextContent('Sizning qarzingiz');
    expect(row).toHaveTextContent('0');
  });
});

describe('qarz cheki — dollar qatori (F6)', () => {
  it('dollar to`lovida ASL summa va MUZLATILGAN kurs chiqadi', async () => {
    vi.mocked(api.get).mockResolvedValue(
      RECEIPT({ currency: 'USD', originalMinor: '10000', exchangeRate: '1245027000000' }),
    );
    renderWithProviders(<PrintDebtPaymentPage />);

    await screen.findByTestId('tovar-chek');
    expect(screen.getByText('Dollar:')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText(/12450\.27/)).toBeInTheDocument();
  });

  it('so`m to`lovida dollar qatori YO`Q (bo`sh qator chizilmaydi)', async () => {
    vi.mocked(api.get).mockResolvedValue(RECEIPT());
    renderWithProviders(<PrintDebtPaymentPage />);

    await screen.findByTestId('tovar-chek');
    expect(screen.getByText('Naqd:')).toBeInTheDocument();
    expect(screen.queryByText('Dollar:')).toBeNull();
  });

  it('kurs yo`q buzuq qatorda chek YO`QOLMAYDI (kurs izohi tushiriladi)', async () => {
    vi.mocked(api.get).mockResolvedValue(
      RECEIPT({ currency: 'USD', originalMinor: '10000', exchangeRate: null }),
    );
    renderWithProviders(<PrintDebtPaymentPage />);

    await screen.findByTestId('tovar-chek');
    await waitFor(() => expect(screen.queryByText(/12450\.27/)).toBeNull());
  });
});
