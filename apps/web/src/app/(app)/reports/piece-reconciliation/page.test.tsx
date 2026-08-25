import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PieceReconciliationReport from './page';

/**
 * K1 — bo'lak sverkasi hisoboti (ekran simlari).
 *
 * Qulflanadigan shartnoma:
 *   * ma'lumot `GET /stock-pieces/reconciliation` dan o'qiladi;
 *   * farq bo'lmasa ekran «farq yo'q» deydi (K1 ning qabul mezoni);
 *   * farq bo'lsa qator ko'rinadi va JIM qolmaydi;
 *   * ogohlantirishlar va kesilgan qatorlar ham ko'rsatiladi.
 * Hisob-mantiq api tomonda (`stock-piece-core.test.ts`) qulflangan.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const EMPTY = {
  totals: {
    trackedProducts: 0,
    buckets: 0,
    diffBuckets: 0,
    activePieces: 0,
    stockQty: '0',
    registryQty: '0',
    diffQty: '0',
  },
  rows: [],
  warnings: [],
  truncated: 0,
};

const WITH_DIFF = {
  totals: {
    trackedProducts: 1,
    buckets: 1,
    diffBuckets: 1,
    activePieces: 1,
    stockQty: '300',
    registryQty: '250',
    diffQty: '-50',
  },
  rows: [
    {
      storeId: 's1',
      storeName: 'Ombor 02',
      cellId: 'c1',
      cellName: '02-03-01-04',
      assortmentKind: 'product',
      assortmentId: 'cable',
      productName: 'UzKabel VVG 2x2.5',
      productCode: 'VVG-25',
      uom: 'm',
      stockQty: '300',
      registryQty: '250',
      diffQty: '-50',
      pieceCount: 1,
      wholeCount: 1,
      status: 'missing' as const,
    },
  ],
  warnings: [],
  truncated: 0,
};

function mockApi(recon: unknown) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/stores')) return { items: [{ id: 's1', name: 'Ombor 02' }] };
    if (url.startsWith('/stock-pieces/reconciliation')) return recon;
    throw new Error(`kutilmagan so'rov: ${url}`);
  });
}

describe('Bo`laklar sverkasi hisoboti', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ma`lumot `/stock-pieces/reconciliation` dan o`qiladi', async () => {
    mockApi(EMPTY);
    renderWithProviders(<PieceReconciliationReport />);
    await waitFor(() =>
      expect(
        vi
          .mocked(api.get)
          .mock.calls.some((c) => String(c[0]).startsWith('/stock-pieces/reconciliation')),
      ).toBe(true),
    );
  });

  it('🔴 farq yo`q ⇒ ekran shuni AYTADI (K1 qabul mezoni)', async () => {
    mockApi(EMPTY);
    renderWithProviders(<PieceReconciliationReport />);
    expect(await screen.findByTestId('piece-recon-clean')).toBeInTheDocument();
    expect(screen.getByTestId('piece-recon-summary')).toBeInTheDocument();
  });

  it('farq bor ⇒ «farq yo`q» bloki KO`RINMAYDI, qator chiqadi', async () => {
    mockApi(WITH_DIFF);
    renderWithProviders(<PieceReconciliationReport />);
    expect(await screen.findByText('UzKabel VVG 2x2.5')).toBeInTheDocument();
    expect(screen.getByText('02-03-01-04')).toBeInTheDocument();
    expect(screen.getByText('-50')).toBeInTheDocument();
    expect(screen.queryByTestId('piece-recon-clean')).not.toBeInTheDocument();
  });

  it('yacheykasiz qator «Yacheykasiz» deb ko`rinadi (bo`sh katak emas)', async () => {
    mockApi({
      ...WITH_DIFF,
      rows: [{ ...WITH_DIFF.rows[0], cellId: null, cellName: null }],
    });
    renderWithProviders(<PieceReconciliationReport />);
    expect(await screen.findByText('Yacheykasiz')).toBeInTheDocument();
  });

  it('ogohlantirish bloki ko`rinadi (bayroq o`chiq, reyestr to`la)', async () => {
    mockApi({
      ...EMPTY,
      warnings: [
        {
          code: 'pieces-without-flag',
          assortmentKind: 'product',
          assortmentId: 'cable',
          productName: 'UzKabel VVG 2x2.5',
          count: 3,
        },
      ],
    });
    renderWithProviders(<PieceReconciliationReport />);
    const box = await screen.findByTestId('piece-recon-warnings');
    expect(box).toHaveTextContent('UzKabel VVG 2x2.5');
    // Ogohlantirish bor ekan — «farq yo'q» degan tinch xabar CHIQMAYDI.
    expect(screen.queryByTestId('piece-recon-clean')).not.toBeInTheDocument();
  });

  it('chegara tufayli kesilgan qatorlar JIM qolmaydi', async () => {
    mockApi({ ...WITH_DIFF, truncated: 7 });
    renderWithProviders(<PieceReconciliationReport />);
    expect(await screen.findByTestId('piece-recon-truncated')).toHaveTextContent('7');
  });

  it('bo`sh reyestrda jadval «bo`sh» deydi', async () => {
    mockApi(EMPTY);
    renderWithProviders(<PieceReconciliationReport />);
    expect(await screen.findByText("Bo'laklar reyestri bo'sh")).toBeInTheDocument();
  });
});
