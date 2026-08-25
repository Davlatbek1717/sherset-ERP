import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellContentsModal } from './cell-contents-modal';

/**
 * «Yacheyka ichidagilar» → «Chiqarish» (egasi 2026-08-25).
 *
 * Nima tekshiriladi:
 *   1. Bog'lanishni uzish HAQIQATAN `DELETE /admin/stores/:s/cells/:c/products/:p`
 *      ga boradi — «Ko'chirish» ning maqsad-yacheyka talabisiz.
 *   2. Q1 qulfi (2026-08-11) UI tomonda ham hurmat qilinadi: qoldiqli qatorda
 *      tugma O'CHIQ va sababi `title` da aytiladi (bosilsa server baribir 409
 *      qaytarardi — foydasiz urinishga yo'l qo'yilmaydi).
 *   3. Poyga holati (qty surati eskirgan, boshqa sessiya sanoq yozib ulgurgan)
 *      — 409 `CELL_STOCK_NOT_EMPTY` xabari MAHSULOT NOMI bilan qayta yoziladi;
 *      xom server matnida faqat `productId` bor.
 *   4. Server idempotent `{unassigned:false}` JIMGINA «muvaffaqiyat» bo'lib
 *      ko'rinmaydi — omborchi «bosdim, hech narsa bo'lmadi» holatida qolmaydi.
 *   5. Tasdiqdan bosh tortilsa hech narsa yuborilmaydi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const perms = vi.hoisted(() => ({
  can: vi.fn((_entity: string, _action: string) => true),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: perms.can }),
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
  { id: 'cell-A', name: '03-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '03-01-01-02', barcode: 'CELLB' },
];

function item(qty: string) {
  return {
    assortmentKind: 'product',
    assortmentId: 'prod-1',
    name: '50-01 coffee plafon veral',
    code: '50-01',
    barcode: null,
    description: null,
    mainImageId: null,
    qty,
  };
}

function open(qty = '0') {
  vi.mocked(api.get).mockResolvedValue({
    cell: { id: 'cell-A', name: '03-01-01-01', barcode: 'CELLA' },
    items: [item(qty)],
  } as never);
  const onChanged = vi.fn();
  renderWithProviders(
    <CellContentsModal
      storeId="store-1"
      cell={{ id: 'cell-A', name: '03-01-01-01' }}
      cells={CELLS}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

/** ConfirmDialog `data-testid` ishlatadi — bu repo'da testId atributi
 *  `data-test-id` ga sozlangan, shuning uchun to'g'ridan-to'g'ri DOM'dan. */
function confirmButton(kind: 'confirm' | 'cancel') {
  return waitFor(() => {
    const el = document.querySelector<HTMLButtonElement>(`[data-testid="confirm-${kind}"]`);
    if (!el) throw new Error('tasdiq oynasi ochilmadi');
    return el;
  });
}

/**
 * Tasdiq tugmasini bosish. `pointerEventsCheck: 0` — JSDOM ARTEFAKTI, mahsulot
 * bug'i emas: ochiq Radix Modal `<body>` ga `pointer-events:none` qo'yadi va
 * ConfirmDialog buni `pointer-events-auto` Tailwind klassi bilan yechadi
 * (ConfirmDialog.tsx dagi oshkora izoh) — testda esa Tailwind CSS yuklanmaydi,
 * shuning uchun klass hech narsa qilmaydi va user-event bosishni rad etadi.
 */
async function clickConfirm(kind: 'confirm' | 'cancel') {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(await confirmButton(kind));
}

async function clickUnassign() {
  await userEvent.click(await screen.findByTestId('cell-contents-unassign-prod-1'));
}

beforeEach(() => {
  perms.can.mockReset();
  perms.can.mockReturnValue(true);
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
  vi.mocked(api.delete).mockResolvedValue({ unassigned: true } as never);
});

describe('CellContentsModal — «Chiqarish»', () => {
  it('qoldiqsiz qator: tasdiqdan keyin DELETE yuboriladi va natija aytiladi', async () => {
    const { onChanged } = open('0');
    await clickUnassign();
    await clickConfirm('confirm');

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-A/products/prod-1'),
    );
    const notice = await screen.findByTestId('cell-contents-notice');
    expect(notice.textContent).toContain('50-01 coffee plafon veral');
    expect(notice.textContent).toContain('03-01-01-01');
    expect(onChanged).toHaveBeenCalled();
  });

  it('tasdiq BEKOR qilinsa hech narsa yuborilmaydi', async () => {
    open('0');
    await clickUnassign();
    await clickConfirm('cancel');
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('Q1: qoldiq bor qatorda tugma O`CHIQ va sababi `title` da', async () => {
    open('5');
    const btn = await screen.findByTestId('cell-contents-unassign-prod-1');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toContain('5');
    // «Ko'chirish» esa ochiq qoladi — qoldiqli tovarning YAGONA to'g'ri yo'li.
    expect(screen.getByTestId('cell-contents-move-prod-1')).not.toBeDisabled();
  });

  it('poyga: 409 `CELL_STOCK_NOT_EMPTY` xabari MAHSULOT NOMI bilan yoziladi', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(
      Object.assign(new Error('HTTP 409'), {
        status: 409,
        body: { code: 'CELL_STOCK_NOT_EMPTY', qty: '26', cell: '03-01-01-01' },
      }),
    );
    open('0');
    await clickUnassign();
    await clickConfirm('confirm');

    const notice = await screen.findByTestId('cell-contents-notice');
    expect(notice.textContent).toContain('50-01 coffee plafon veral');
    expect(notice.textContent).toContain('26');
  });

  it('TZ v3 §3: `store.update` yo`q rolda (omborchi) tugma UMUMAN ko`rinmaydi', async () => {
    // Egasining 2026-08-11 · Q2 qarori: omborchi bog'lay/sanay oladi, lekin
    // CHIQARA olmaydi — serverda `store.update` bilan qulflangan. UI shu
    // assimetriyani takrorlashi shart, aks holda tugma faqat 403 berardi.
    perms.can.mockImplementation((entity: string, _action: string) => entity !== 'store');
    open('0');
    expect(await screen.findByTestId('cell-contents-move-prod-1')).toBeInTheDocument();
    expect(screen.queryByTestId('cell-contents-unassign-prod-1')).toBeNull();
  });

  it('idempotent `{unassigned:false}` JIMGINA muvaffaqiyat bo`lib ko`rinmaydi', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ unassigned: false } as never);
    open('0');
    await clickUnassign();
    await clickConfirm('confirm');

    const notice = await screen.findByTestId('cell-contents-notice');
    expect(notice.textContent).toContain('eskirgan');
  });
});
