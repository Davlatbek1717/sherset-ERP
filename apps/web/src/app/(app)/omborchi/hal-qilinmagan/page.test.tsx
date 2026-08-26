import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HalQilinmaganPage from './page';

/**
 * K6/3 — «Hal qilinmagan» ekrani (simlar shartnomasi).
 *
 * Qulflanadigan da'volar:
 *   * ro'yxat `piecetracking.view` yo'lidan keladi va faqat KO'RSATADI;
 *   * «Ha» ham, «Yo'q» ham AYNI yo'lga (`POST /stock-pieces/flag`) boradi —
 *     ya'ni ikkalasi ham QAROR va tovar ro'yxatdan chiqadi;
 *   * bayrog'i YOQILGAN qatorlar ajratib ko'rsatiladi (ular kassa xulqini
 *     allaqachon o'zgartirgan — K3 ning ochiq xavfi);
 *   * ruxsat yo'q foydalanuvchida tugmalar YO'Q.
 * Saralash va tasnif api tomonda (`piece-flag-policy.test.ts`) qulflangan.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const canMock = vi.fn(() => true);
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: canMock }),
}));

function response(over: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        id: 'p1',
        name: 'UzKabel VVG 2x2.5',
        code: 'VVG-25',
        uom: 'м',
        pieceTracked: true,
        activePieces: 4,
        state: 'pending-on',
      },
      {
        id: 'p2',
        name: 'Shlang 20mm',
        code: null,
        uom: 'м',
        pieceTracked: false,
        activePieces: 0,
        state: 'pending-off',
      },
    ],
    totals: { pending: 2, pendingOn: 1, decided: 7 },
    truncated: 0,
    scanTruncated: false,
    ...over,
  };
}

function mockGet(data: unknown = response()) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (String(url).startsWith('/stock-pieces/pending-decisions')) return data;
    throw new Error(`kutilmagan so'rov: ${url}`);
  });
}

describe('«Hal qilinmagan» ekrani', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('ro`yxat va jamilar ko`rinadi', async () => {
    mockGet();
    renderWithProviders(<HalQilinmaganPage />);
    await screen.findByTestId('pending-totals');
    expect(screen.getAllByTestId(/^pending-row-/)).toHaveLength(2);
    expect(screen.getByText('UzKabel VVG 2x2.5')).toBeInTheDocument();
    expect(screen.getByTestId('pending-totals')).toHaveTextContent('7');
  });

  it('🔴 bayrog`i YOQILGAN qator ajratib ko`rsatiladi', async () => {
    // Bu qatorlarda kassa taqsimoti ALLAQACHON boshqacha ishlaydi
    // (K3 ning 7.1 istisnosi) — ular ko'zga tashlanishi kerak.
    mockGet();
    renderWithProviders(<HalQilinmaganPage />);
    const row = await screen.findByTestId('pending-row-p1');
    expect(row).toHaveTextContent('Yoqilgan');
  });

  it('«Ha» — bayroqni yoqadi (QAROR sifatida)', async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ id: 'p2', pieceTracked: true, decidedAt: 'now' });
    renderWithProviders(<HalQilinmaganPage />);
    fireEvent.click(await screen.findByTestId('pending-yes-p2'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/stock-pieces/flag', {
        assortmentId: 'p2',
        pieceTracked: true,
      }),
    );
  });

  it('🔴 «Yo`q» ham AYNI yo`lga boradi — u ham QAROR', async () => {
    // Agar «yo'q» hech nima yozmasa, tovar ro'yxatdan hech qachon
    // chiqmasdi va foydalanuvchi har kuni o'sha qatorni ko'rardi.
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ id: 'p1', pieceTracked: false, decidedAt: 'now' });
    renderWithProviders(<HalQilinmaganPage />);
    fireEvent.click(await screen.findByTestId('pending-no-p1'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/stock-pieces/flag', {
        assortmentId: 'p1',
        pieceTracked: false,
      }),
    );
  });

  it('ruxsat yo`q — qaror tugmalari YO`Q', async () => {
    canMock.mockReturnValue(false);
    mockGet();
    renderWithProviders(<HalQilinmaganPage />);
    await screen.findByTestId('pending-row-p1');
    expect(screen.queryByTestId('pending-yes-p1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-no-p1')).not.toBeInTheDocument();
  });

  it('bo`sh ro`yxat — «qaror kutayotgan tovar yo`q»', async () => {
    mockGet(response({ rows: [], totals: { pending: 0, pendingOn: 0, decided: 12 } }));
    renderWithProviders(<HalQilinmaganPage />);
    expect(await screen.findByTestId('pending-empty')).toBeInTheDocument();
  });

  it('qidiruv so`rovga uzatiladi', async () => {
    mockGet();
    renderWithProviders(<HalQilinmaganPage />);
    await screen.findByTestId('pending-totals');
    fireEvent.change(screen.getByTestId('pending-search'), { target: { value: 'kabel' } });
    await waitFor(() =>
      expect(
        vi
          .mocked(api.get)
          .mock.calls.map((c) => String(c[0]))
          .some((u) => u.includes('search=kabel')),
      ).toBe(true),
    );
  });

  it('🔴 katalog skani kesilsa ekran shuni AYTADI (jim kesish yo`q)', async () => {
    mockGet(response({ scanTruncated: true }));
    renderWithProviders(<HalQilinmaganPage />);
    expect(await screen.findByTestId('pending-scan-truncated')).toBeInTheDocument();
  });

  it('ekran hech narsa YOZMAYDI — faqat bayroq yo`li', async () => {
    mockGet();
    renderWithProviders(<HalQilinmaganPage />);
    await screen.findByTestId('pending-totals');
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});
