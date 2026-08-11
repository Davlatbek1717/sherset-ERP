import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellMoveTargetModal } from './cell-move-target-modal';

/**
 * «Ko'chirish» oynasi — Q1 qulfi bilan tutashgan joyi (review 2026-08-11,
 * IMPORTANT-3).
 *
 * Oqim: (1) sanalgan qoldiq `POST /products/:id/cell-move` bilan ko'chadi,
 * (2) uy-yacheyka bog'lanishi DELETE + POST bilan ergashadi. `qty` — oyna
 * OCHILGANDAGI surat, ya'ni eskirishi mumkin: `Number(qty) > 0` sharti nol
 * suratda 1-qadamni butunlay o'tkazib yuboradi, keyin 2-qadam server qulfidan
 * 409 oladi. Xom server matni bu holatda CHALG'ITADI — u «boshqa yacheykaga
 * ko'chiring» deydi, holbuki foydalanuvchi aynan shuni qilyapti.
 *
 * Bu oyna uchun bugungacha test yo'q edi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/components/stores/use-barcode-camera', () => ({
  useBarcodeCamera: () => ({
    videoRef: { current: null },
    cameraOn: false,
    cameraError: null,
    diag: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));

const { api } = await import('@/lib/api-client');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

function open(qty = '0') {
  const onMoved = vi.fn();
  const onOpenChange = vi.fn();
  renderWithProviders(
    <CellMoveTargetModal
      open
      onOpenChange={onOpenChange}
      storeId="store-1"
      cells={CELLS}
      product={{ id: 'prod-1', name: 'Olma' }}
      fromCell={{ id: 'cell-A', name: '01-01-01-01' }}
      qty={qty}
      onMoved={onMoved}
    />,
  );
  return { onMoved, onOpenChange };
}

/** Maqsad yacheykani belgilab, «Ko'chirish» ni bosadi. */
async function moveToB() {
  await userEvent.click(
    screen.getByTestId('cell-move-row-cell-B').querySelector('button') as Element,
  );
  await userEvent.click(screen.getByTestId('cell-move-confirm'));
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
  // Bog'lanish manbada bor ⇒ DELETE bosqichiga yetiladi.
  vi.mocked(api.get).mockResolvedValue({ items: [{ id: 'prod-1' }] } as never);
  vi.mocked(api.post).mockResolvedValue({} as never);
  vi.mocked(api.delete).mockResolvedValue({} as never);
});

describe('CellMoveTargetModal — Q1 qulfi bilan tutashuv', () => {
  it('DELETE 409 `CELL_STOCK_NOT_EMPTY` ⇒ ATALGAN xabar, «qayta ko`chiring» emas', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(
      Object.assign(new Error('HTTP 409'), {
        status: 409,
        body: { code: 'CELL_STOCK_NOT_EMPTY', qty: '26', cell: '01-01-01-01' },
      }),
    );
    const { onMoved, onOpenChange } = open('0');

    await moveToB();

    const banner = await screen.findByTestId('cell-move-banner');
    // Qaysi yacheyka va hozirgi qoldiq ko'rinadi.
    expect(banner).toHaveTextContent('01-01-01-01');
    expect(banner).toHaveTextContent('26');
    // Xom server matni («boshqa yacheykaga ko'chiring») CHIQMAYDI — u shu
    // oynada ma'nosiz maslahat.
    expect(banner).not.toHaveTextContent("boshqa yacheykaga ko'chiring");
    // Ko'chirish MUVAFFAQIYATLI deb belgilanmaydi va oyna yopilmaydi.
    expect(onMoved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('409 dan boshqa xato — umumiy «Ko`chirishda xato» yo`li saqlanadi', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error('tarmoq uzildi'));
    open('0');

    await moveToB();

    const banner = await screen.findByTestId('cell-move-banner');
    await waitFor(() => expect(banner).toHaveTextContent('tarmoq uzildi'));
    expect(banner).not.toHaveTextContent('26');
  });

  it('muvaffaqiyatli ko`chirish — qoldiq ham, bog`lanish ham ergashadi', async () => {
    const { onMoved, onOpenChange } = open('5');

    await moveToB();

    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    // 1) qoldiq ko'chdi, 2) bog'lanish maqsadga yozildi.
    expect(api.post).toHaveBeenCalledWith('/products/prod-1/cell-move', {
      storeId: 'store-1',
      fromCellId: 'cell-A',
      toCellId: 'cell-B',
      qty: '5',
    });
    expect(api.delete).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-A/products/prod-1');
    expect(api.post).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-B/products', {
      productIds: ['prod-1'],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
