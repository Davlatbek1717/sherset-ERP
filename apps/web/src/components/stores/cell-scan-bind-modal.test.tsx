import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellScanBindModal } from './cell-scan-bind-modal';

/**
 * TZ v3 §1 — «Scan» oynasi (yacheyka ↔ mahsulot bog'lash).
 *
 * Bu oynada bugungacha BIRORTA test yo'q edi (701 qator). Quyidagi xulqlar
 * qulflanadi:
 *   §1.2 band yacheyka tugmalarida mahsulot NOMI turadi;
 *   §1.2 «chiqarib qo'shish» — chiqarish ham faqat «Saqlash» paytida
 *        (avval DELETE, keyin POST);
 *   §1.2 qaror HAR YACHEYKA UCHUN BIR MARTA so'raladi;
 *   §1.2 chiqariladiganlar ro'yxati — qaror lahzasidagi SERVER tarkibi
 *        (shu sessiyada staged qilingan qatorlar hech qachon chiqarilmaydi);
 *   §1.4 staged dublikat — sariq «ro'yxatda bor», server chaqirig'i yo'q;
 *   §3   chiqarish huquqi (`store.update`) yo'q bo'lsa tugma ko'rinmaydi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/beep', () => ({ beep: vi.fn() }));
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
// TZ §3: chiqarish huquqi (`store.update`) — default holatda BOR (administrator).
// Oxirgi test uni bir holat uchun 'NO' ga tushiradi.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ matrix: { store: { update: 'ALL' } } })),
}));

const { api } = await import('@/lib/api-client');
const { usePermissions } = await import('@/hooks/use-permissions');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

/** `/products?search=…` → bitta aniq mahsulot; cells/:id/products → band tarkib. */
function mockApi({ occupants }: { occupants: Array<{ id: string; name: string }> }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/products?search=')) {
      const code = decodeURIComponent(url.split('search=')[1]?.split('&')[0] ?? '');
      return {
        items: [
          {
            id: `prod-${code}`,
            name: `Tovar ${code}`,
            code,
            article: null,
            barcodes: [code],
            packBarcodes: [],
          },
        ],
      } as never;
    }
    if (url.includes('/products')) return { items: occupants } as never;
    return { cells: [] } as never;
  });
  vi.mocked(api.post).mockResolvedValue({} as never);
  vi.mocked(api.delete).mockResolvedValue({} as never);
}

function open() {
  renderWithProviders(
    <CellScanBindModal
      open
      onOpenChange={vi.fn()}
      storeId="store-1"
      cells={CELLS}
      initialCell={null}
      onBound={vi.fn()}
    />,
  );
}

async function scan(code: string) {
  const input = screen.getByTestId('cell-scan-input');
  await userEvent.type(input, `${code}{Enter}`);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
  // Ruxsat mocki testlar orasida TIKLANADI — `mockReturnValueOnce` bitta
  // render'ga yetmaydi (komponent har skanda qayta render bo'ladi).
  vi.mocked(usePermissions).mockReturnValue({
    matrix: { store: { update: 'ALL' } },
  } as never);
});

describe('CellScanBindModal — TZ v3 §1', () => {
  it('§1.2 band yacheyka tugmalarida mavjud mahsulot NOMI turadi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-add-together')).toHaveTextContent('Olma');
    expect(screen.getByTestId('cell-scan-replace')).toHaveTextContent('Olma');
  });

  it('§1.2 ikkitadan ko`p egallovchi — «Olma +1» ko`rinishida', async () => {
    mockApi({
      occupants: [
        { id: 'p1', name: 'Olma' },
        { id: 'p2', name: 'Anor' },
      ],
    });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-replace')).toHaveTextContent('Olma +1');
  });

  it('§1.2 «chiqarib qo`shish» — saqlashda AVVAL delete, KEYIN post', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('cell-scan-replace'));
    // Skan paytida SERVERGA hech narsa yozilmaydi.
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();

    const order: string[] = [];
    vi.mocked(api.delete).mockImplementation(async (u: string) => {
      order.push(`DELETE ${u}`);
      return {} as never;
    });
    vi.mocked(api.post).mockImplementation(async (u: string) => {
      order.push(`POST ${u}`);
      return {} as never;
    });

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(order).toHaveLength(2));
    expect(order[0]).toBe('DELETE /admin/stores/store-1/cells/cell-A/products/prod-old');
    expect(order[1]).toBe('POST /admin/stores/store-1/cells/cell-A/products');
  });

  it('§1.2 qaror HAR YACHEYKA UCHUN BIR MARTA — ikkinchi skan so`ramaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));

    await scan('X2');

    // Dialog qayta OCHILMAYDI, ikkinchi qator ro'yxatga jimgina tushadi.
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(2),
    );
    expect(screen.queryByTestId('cell-scan-conflict-msg')).not.toBeInTheDocument();
  });

  /**
   * `evict` ro'yxati — qaror qabul qilingan lahzadagi SERVER tarkibi. Agar u
   * saqlash paytida «yacheykaning hozirgi mazmuni» sifatida qayta hisoblansa
   * (yoki staged qatorlarni ham qamrasa), foydalanuvchi shu sessiyada
   * qo'shgan qatorlar o'zini-o'zi chiqarib yuborardi: DELETE prod-X1 → POST
   * prod-X1 poygasi, yakuniy natija tasodifiy.
   */
  it('§1.2 chiqarish faqat SERVER tarkibiga tegadi — staged qatorlar chiqarilmaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));

    // Ikkinchi mahsulot — qaror eslab qolingani uchun jimgina staged bo'ladi.
    await scan('X2');
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(2),
    );

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-A/products/prod-old');
  });

  it('§1.4 staged dublikat — sariq «ro`yxatda bor», qator qo`shilmaydi', async () => {
    mockApi({ occupants: [] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(1),
    );

    await scan('X1');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('allaqachon ro'),
    );
    expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(1);
  });

  it('§3 chiqarish huquqi yo`q foydalanuvchida «chiqarib qo`shish» KO`RINMAYDI', async () => {
    vi.mocked(usePermissions).mockReturnValue({
      matrix: { store: { update: 'NO' } },
    } as never);

    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-add-together')).toBeInTheDocument();
    expect(screen.queryByTestId('cell-scan-replace')).not.toBeInTheDocument();
  });
});
