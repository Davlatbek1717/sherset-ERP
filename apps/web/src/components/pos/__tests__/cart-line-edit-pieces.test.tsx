import { CartLineEditModal, type CartLineEditTarget } from '@/components/pos/cart-line-edit-modal';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, within } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';

/**
 * K3 — savat qatori oynasida BO'LINADIGAN tovar (kabel/sim/shlang).
 *
 * Qulflanadigan shartnomalar:
 *  🔴 bayroq O'CHIQ tovarda oyna AVVALGIDEK — bo'lak so'rovi umuman
 *     yuborilmaydi (K3 qabul mezoni: «bayroq o'chiq tovarlarda kassa ekrani
 *     mutlaqo o'zgarmagan»);
 *  🔴 kassir taklifni qabul qilsa tarkib savatga TUSHADI, lekin MIQDOR
 *     O'ZGARMAYDI (`150 + 30` — bu aynan o'sha 180);
 *  🔴 miqdorga QO'LDA tegilsa kelishuv BEKOR bo'ladi (eski tarkib yangi
 *     miqdorga yolg'on ko'rsatma bo'lardi).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockGet = vi.mocked(api.get);

const LINE: CartLineEditTarget = {
  productId: 'p-1',
  productName: 'UzKabel VVG 2x2.5',
  quantity: '180',
  priceStr: '10000',
  priceMinor: 1_000_000n,
  costMinor: 600_000n,
  wholesaleMinor: 800_000n,
  basePriceMinor: 1_000_000n,
  pieceTracked: true,
};

const AVAILABILITY = {
  product: { id: 'p-1', name: 'UzKabel VVG 2x2.5', uom: 'м', pieceTracked: true },
  stores: [],
  composition: {
    wholeGroups: [],
    pieces: [
      { id: 'a', label: 'BLK-000001', length: '150', cellName: null },
      { id: 'b', label: 'BLK-000002', length: '70', cellName: null },
    ],
    registryQty: '220',
    activePieces: 2,
    wholeCount: 0,
    longest: '150',
  },
  offer: {
    requested: '180',
    verdict: 'needs-split' as const,
    single: null,
    suggestion: ['150', '30'],
    longest: '150',
    registryQty: '220',
    missing: '0',
  },
};

function open(over: Partial<CartLineEditTarget> = {}) {
  mockGet.mockResolvedValue(AVAILABILITY);
  const onSave = vi.fn();
  renderWithProviders(
    <CartLineEditModal
      line={{ ...LINE, ...over }}
      onSave={onSave}
      onRemove={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return { onSave };
}

async function tap(user: ReturnType<typeof userEvent.setup>, ...keys: string[]) {
  const pad = screen.getByTestId('pos-line-edit');
  for (const k of keys) await user.click(within(pad).getByRole('button', { name: k }));
}

describe('bayroq O`CHIQ — oyna avvalgidek', () => {
  it('bo`lak so`rovi UMUMAN yuborilmaydi', async () => {
    open({ pieceTracked: false });
    await screen.findByTestId('pos-line-edit');
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pos-piece-offer')).toBeNull();
  });
});

describe('bayroq YOQILGAN — bo`lak paneli ochiladi', () => {
  it('tarkib va taklif ko`rinadi', async () => {
    open();
    expect(await screen.findByTestId('pos-piece-offer')).toBeTruthy();
    expect((await screen.findByTestId('pos-piece-verdict-split')).textContent).toContain(
      '150 + 30',
    );
  });

  it('🔴 taklif qabul qilinsa tarkib saqlanadi, MIQDOR o`zgarmaydi', async () => {
    const { onSave } = open();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pos-piece-apply-split'));

    // Kelishuv qatori oynada ko'rinadi.
    expect((await screen.findByTestId('pos-line-edit-pieces')).textContent).toContain('150 + 30');

    await user.click(screen.getByTestId('pos-line-edit-save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '180', pieceLengths: ['150', '30'] }),
    );
  });

  it('🔴 miqdor QO`LDA o`zgartirilsa kelishuv bekor bo`ladi', async () => {
    const { onSave } = open();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pos-piece-apply-split'));
    await screen.findByTestId('pos-line-edit-pieces');

    // Numpad: miqdor 200 bo'ldi ⇒ «150 + 30» endi yolg'on bo'lardi.
    await tap(user, '2', '0', '0');
    expect(screen.queryByTestId('pos-line-edit-pieces')).toBeNull();

    await user.click(screen.getByTestId('pos-line-edit-save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: '200', pieceLengths: undefined }),
    );
  });

  it('kelishuvni qo`lda bekor qilish mumkin', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pos-piece-apply-split'));
    await user.click(await screen.findByTestId('pos-line-edit-pieces-clear'));
    expect(screen.queryByTestId('pos-line-edit-pieces')).toBeNull();
  });

  it('qulflangan (zakazga bog`langan) savatda taklif tugmasi YO`Q', async () => {
    mockGet.mockResolvedValue(AVAILABILITY);
    renderWithProviders(
      <CartLineEditModal
        line={LINE}
        readOnly
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByTestId('pos-piece-offer');
    expect(screen.queryByTestId('pos-piece-apply-split')).toBeNull();
  });
});
