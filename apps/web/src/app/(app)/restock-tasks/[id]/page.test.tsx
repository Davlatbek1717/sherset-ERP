import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RestockTaskDetailPage from './page';

/**
 * K4 — omborchining KESIM oqimi (yig'ish topshirig'i ekrani).
 *
 * Qulflanadigan da'volar:
 *   * bo'linadigan tovar qatorida kesim tugmasi va kassirning KELISHUVI
 *     («150 + 30») ko'rinadi — K3 da u faqat savatda qolardi;
 *   * kesimdan keyin yorliq oynasi AVTOMATIK ochiladi (K-reja 5-bo'lim:
 *     «har kesim yorliq bosilishi bilan tugaydi»);
 *   * reyestr BO'SH bo'lsa kesim tugmasi CHIQMAYDI va qator odatdagidek
 *     yopiladi (K3 ning `no-registry` qoidasi — savdo to'xtamaydi);
 *   * bayrog'i o'chiq oddiy tovarda ekran BIR BAYT ham o'zgarmaydi.
 *
 * Hisob-mantiq api tomonda (`piece-cut-core.test.ts`) qulflangan.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'task-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Kamera skaneri jsdom'da ishlamaydi va bu test uni sinamaydi.
vi.mock('@/components/restock/qr-scanner', () => ({ QrScanner: () => null }));

const PIECE_LINE = {
  id: 'line-1',
  productId: 'p1',
  productName: 'UzKabel VVG 2x2.5',
  quantity: '180',
  binLocation: '07-01-01-01',
  confirmedAt: null,
  confirmedByName: null,
  shortageQty: null,
  shortageNote: null,
  shortageByName: null,
  pieceTracked: true,
  agreedLengths: ['150', '30'],
  pieceOptions: [
    { id: 'src-1', label: 'BLK-000001', length: '250', whole: false, cellName: '07-01-01-01' },
  ],
  cutPieces: [],
  cutCoverage: 'missing' as const,
};

const PLAIN_LINE = {
  id: 'line-2',
  productId: 'p2',
  productName: 'Rozetka',
  quantity: '3',
  binLocation: '02-01-01-01',
  confirmedAt: null,
  confirmedByName: null,
  shortageQty: null,
  shortageNote: null,
  shortageByName: null,
  pieceTracked: false,
};

function task(lines: unknown[]) {
  return {
    id: 'task-1',
    sourceName: 'CHK-000123',
    storeName: 'Ombor 07',
    assigneeName: 'Omborchi Aka',
    createdByName: 'Kassir',
    status: 'pending',
    note: null,
    createdAt: '2026-08-26T06:00:00.000Z',
    lines,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('K4 — kesim oqimi (web)', () => {
  it("bo'linadigan tovar qatorida KESIM tugmasi va kassirning kelishuvi ko'rinadi", async () => {
    vi.mocked(api.get).mockResolvedValue(task([PIECE_LINE]));
    renderWithProviders(<RestockTaskDetailPage />);

    expect(await screen.findByTestId('restock-cut-line-1')).toBeInTheDocument();
    // Kassir mijoz bilan «150 + 30» ga kelishgan — omborchi buni KO'RADI.
    expect(screen.getByTestId('line-pieces').textContent).toContain('150 + 30');
  });

  it('kesimdan keyin YORLIQ oynasi avtomatik ochiladi', async () => {
    const cutLine = {
      ...PIECE_LINE,
      cutPieces: [
        { id: 'new-1', label: 'BLK-000041', length: '180', whole: false, cellName: '07-01-01-01' },
      ],
      pieceOptions: [
        { id: 'new-2', label: 'BLK-000042', length: '70', whole: false, cellName: '07-01-01-01' },
      ],
      cutCoverage: 'covered' as const,
    };
    vi.mocked(api.get).mockResolvedValue(task([PIECE_LINE]));
    vi.mocked(api.post).mockResolvedValue({
      task: task([cutLine]),
      labels: ['BLK-000041', 'BLK-000042'],
    });

    renderWithProviders(<RestockTaskDetailPage />);
    fireEvent.click(await screen.findByTestId('restock-cut-line-1'));

    const modal = await screen.findByTestId('restock-cut-modal');
    expect(modal).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cut-length-input'), { target: { value: '180' } });
    fireEvent.click(screen.getByTestId('cut-submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/restock-tasks/task-1/lines/line-1/cut');
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      pieceId: 'src-1',
      cutLength: '180',
    });

    // 🔴 Yorliq oynasi O'ZI ochiladi: kesim yorliqsiz tugamaydi.
    const overlay = await screen.findByTestId('piece-label-overlay');
    expect(overlay.textContent).toContain('BLK-000041');
    expect(overlay.textContent).toContain('BLK-000042');
  });

  it("skanerlangan `BLK-` yorlig'i manba sifatida yuboriladi", async () => {
    vi.mocked(api.get).mockResolvedValue(task([PIECE_LINE]));
    vi.mocked(api.post).mockResolvedValue({ task: task([PIECE_LINE]), labels: [] });

    renderWithProviders(<RestockTaskDetailPage />);
    fireEvent.click(await screen.findByTestId('restock-cut-line-1'));
    fireEvent.change(await screen.findByTestId('cut-scan-input'), {
      target: { value: 'BLK-000007' },
    });
    fireEvent.change(screen.getByTestId('cut-length-input'), { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('cut-submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      label: 'BLK-000007',
      cutLength: '50',
    });
    // Skan kiritilganda `pieceId` YUBORILMAYDI — manba bitta va aniq.
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).not.toHaveProperty('pieceId');
  });

  it("omborchi tuzatgan QOLDIQ ham yuboriladi (kesim yo'qotishi)", async () => {
    vi.mocked(api.get).mockResolvedValue(task([PIECE_LINE]));
    vi.mocked(api.post).mockResolvedValue({ task: task([PIECE_LINE]), labels: [] });

    renderWithProviders(<RestockTaskDetailPage />);
    fireEvent.click(await screen.findByTestId('restock-cut-line-1'));
    fireEvent.change(await screen.findByTestId('cut-length-input'), { target: { value: '180' } });
    fireEvent.change(screen.getByTestId('cut-remaining-input'), { target: { value: '68' } });
    fireEvent.click(screen.getByTestId('cut-submit'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({ remainingLength: '68' });
  });

  it("🔴 reyestr BO'SH bo'lsa kesim tugmasi CHIQMAYDI (savdo to'xtamaydi)", async () => {
    vi.mocked(api.get).mockResolvedValue(
      task([{ ...PIECE_LINE, pieceOptions: [], cutCoverage: 'not-required' as const }]),
    );
    renderWithProviders(<RestockTaskDetailPage />);

    // Qatorni yopadigan tugma joyida — omborchi odatdagidek ishlaydi.
    expect(await screen.findByTestId('restock-place-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('restock-cut-line-1')).not.toBeInTheDocument();
  });

  it("bayrog'i O'CHIQ oddiy tovarda bo'lak bloki UMUMAN chizilmaydi", async () => {
    vi.mocked(api.get).mockResolvedValue(task([PLAIN_LINE]));
    renderWithProviders(<RestockTaskDetailPage />);

    expect(await screen.findByTestId('restock-place-line-2')).toBeInTheDocument();
    expect(screen.queryByTestId('line-pieces')).not.toBeInTheDocument();
    expect(screen.queryByTestId('restock-cut-line-2')).not.toBeInTheDocument();
  });
});
