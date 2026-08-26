import { PieceTrackingCard } from '@/components/products/piece-tracking-card';
import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K6/1 — tovar kartochkasidagi «Bo'lak hisobi» bayrog'i.
 *
 * Eng muhim da'vo: bayroq **forma bilan saqlanmaydi**, u alohida yo'lga
 * (`POST /stock-pieces/flag`) boradi va `piecetracking.update` ruxsatini
 * talab qiladi (K-Q9). Formaning `product.update` yo'liga qo'shilsa, tovar
 * kartochkasini tahrirlay oladigan har kim kassa taqsimotini (K3 ning 7.1
 * istisnosi) jimgina o'zgartira olardi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const canMock = vi.fn(() => true);
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: canMock }),
}));

function mockProduct(over: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockResolvedValue({
    id: 'p1',
    name: 'UzKabel VVG 2x2.5',
    uom: 'м',
    pieceTracked: false,
    pieceTrackedDecidedAt: null,
    ...over,
  });
}

describe('«Bo`lak hisobi» kartasi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMock.mockReturnValue(true);
  });

  it('holatni ko`rsatadi (o`chiq)', async () => {
    mockProduct();
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    expect(await screen.findByTestId('piece-flag-state')).toHaveTextContent("O'chiq");
  });

  it('🔴 bayroq ALOHIDA yo`lga boradi — forma emas', async () => {
    mockProduct();
    vi.mocked(api.post).mockResolvedValue({ id: 'p1', pieceTracked: true, decidedAt: 'now' });
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    // Ma'lumot kelmaguncha tugma o'chiq turadi (`disabled={!row}`) — aks
    // holda bosish jimgina yo'qolardi va test yolg'on yashil bo'lardi.
    await waitFor(() => expect(screen.getByTestId('piece-flag-toggle')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('piece-flag-toggle'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/stock-pieces/flag', {
        assortmentId: 'p1',
        pieceTracked: true,
      }),
    );
    // Tovar kartochkasining o'z saqlash yo'liga TEGILMAYDI.
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('yoqilgan tovarda o`chirish tugmasi va reyestr havolasi bo`ladi', async () => {
    mockProduct({ pieceTracked: true, pieceTrackedDecidedAt: '2026-08-26T10:00:00.000Z' });
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    await waitFor(() =>
      expect(screen.getByTestId('piece-flag-toggle')).toHaveTextContent("O'chirish"),
    );
    expect(screen.getByTestId('piece-flag-registry-link')).toHaveAttribute(
      'href',
      '/omborchi/bolaklar',
    );
  });

  it('qaror qilinmagan tovarda ogohlantirish va ro`yxatga havola', async () => {
    mockProduct({ pieceTracked: true, pieceTrackedDecidedAt: null });
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    const box = await screen.findByTestId('piece-flag-undecided');
    expect(box).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hal qilinmagan/i })).toHaveAttribute(
      'href',
      '/omborchi/hal-qilinmagan',
    );
  });

  it('qaror qilingan tovarda ogohlantirish YO`Q', async () => {
    mockProduct({ pieceTrackedDecidedAt: '2026-08-26T10:00:00.000Z' });
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    await screen.findByTestId('piece-flag-state');
    expect(screen.queryByTestId('piece-flag-undecided')).not.toBeInTheDocument();
  });

  it('🔴 ruxsat yo`q — holat KO`RINADI, tugma YO`Q', async () => {
    // «Yashirish» emas, «o'chirish»: bayroq nima uchun yoqilganini
    // tushunish kassirga ham, menejerga ham kerak.
    canMock.mockReturnValue(false);
    mockProduct({ pieceTracked: true });
    renderWithProviders(<PieceTrackingCard productId="p1" />);
    expect(await screen.findByTestId('piece-flag-state')).toBeInTheDocument();
    expect(screen.queryByTestId('piece-flag-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('piece-flag-readonly')).toBeInTheDocument();
  });
});
