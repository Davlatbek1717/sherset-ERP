import { api } from '@/lib/api-client';
import { debtApi } from '@/lib/debt-api';
import { renderWithProviders, screen } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DebtsPage from './page';

/**
 * Q4 (2026-08-25) — QARZDORLAR RO'YXATIDA MANBA USTUNI.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q4 vazifa 3.
 *
 * Shartnoma: menejer IKKI ekranda (bu ro'yxat va `/menejer/undirish`) AYNAN
 * bir xil haqiqatni ko'radi — bir xil yopiq lug'at (`DebtSourceKind`), bir
 * xil belgi va kassa qarzida chek RAQAMI havolasi. Ikkinchi nusxa yozilsa
 * ekranlar bir kun ayrilardi.
 *
 * ⚠️ Ustun sarlavhasi `col_debt_source` — `col_source` EMAS: u allaqachon
 * band va BOSHQA ma'noda (to'lovlar ekranida «pul qayerdan qabul qilindi»).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('@/lib/debt-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/debt-api')>();
  return {
    ...actual,
    debtApi: {
      ...actual.debtApi,
      list: vi.fn(),
      summary: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/debts',
  useSearchParams: () => new URLSearchParams(),
}));

function debtRow(over: Record<string, unknown> = {}) {
  return {
    id: 'debt-1',
    name: 'QRZ-2026-00001',
    counterpartyId: 'cp-1',
    counterpartyName: 'Romashka MChJ',
    phone: '+998901112233',
    totalMinor: '80000',
    paidMinor: '30000',
    remainingMinor: '50000',
    currency: 'UZS',
    status: 'partial',
    nextContactAt: null,
    overdue: false,
    lastNote: null,
    lastCallAt: null,
    lastCallOutcome: null,
    problem: false,
    problemReason: null,
    problemAt: null,
    comment: null,
    ownerId: null,
    ownerName: null,
    issuedByName: null,
    // Q4 — default: qo'lda ochilgan reyestr qatori.
    source: 'registry',
    sourceDocId: null,
    sourceDocNumber: null,
    closedAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  };
}

function mountWith(rows: Array<Record<string, unknown>>) {
  vi.mocked(api.get).mockResolvedValue({ items: [] } as never);
  vi.mocked(debtApi.summary).mockResolvedValue({
    outstandingMinor: '50000',
    debtorCount: rows.length,
    overdueMinor: '0',
    overdueCount: 0,
    todayCallCount: 0,
    problemCount: 0,
  } as never);
  vi.mocked(debtApi.list).mockResolvedValue({
    rows,
    total: rows.length,
    outstandingMinor: '50000',
  } as never);
  return renderWithProviders(<DebtsPage />);
}

describe('Q4 — qarzdorlar ro`yxatida qarz MANBASI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('kassa cheki qatorida belgi va CHEK RAQAMI havolasi chiqadi', async () => {
    mountWith([
      debtRow({ source: 'retailsale', sourceDocId: 'sale-1', sourceDocNumber: 'CHK-2026-00042' }),
    ]);
    await screen.findByText('Romashka MChJ');

    const link = screen.getByRole('link', { name: 'CHK-2026-00042' });
    expect(link).toHaveAttribute('href', '/retail/sales/sale-1');
    // Belgi matni undirish ekranidagi bilan BIR XIL lug'atdan.
    expect(screen.getAllByText('Kassa cheki').length).toBeGreaterThan(0);
  });

  it('qo`lda ochilgan qatorda «Reyestr» belgisi, chek havolasi YO`Q', async () => {
    mountWith([debtRow()]);
    await screen.findByText('Romashka MChJ');

    expect(screen.getAllByText('Reyestr').length).toBeGreaterThan(0);
    expect(screen.queryByText(/CHK-/)).toBeNull();
  });

  it('chek RAQAMI kelmasa — belgi qoladi, xom id chizilmaydi', async () => {
    mountWith([debtRow({ source: 'retailsale', sourceDocId: 'sale-1', sourceDocNumber: null })]);
    await screen.findByText('Romashka MChJ');

    expect(screen.getAllByText('Kassa cheki').length).toBeGreaterThan(0);
    expect(screen.queryByText(/sale-1/)).toBeNull();
  });

  it('ustun sarlavhasi xom i18n kaliti bo`lib chizilmaydi', async () => {
    mountWith([debtRow()]);
    await screen.findByText('Romashka MChJ');
    expect(screen.queryByText(/pages\.debts\.(col_debt_source|source_)/)).toBeNull();
    expect(screen.getByText('Qarz manbasi')).toBeInTheDocument();
  });
});
