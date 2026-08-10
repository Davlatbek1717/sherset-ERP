import { renderWithProviders, screen, waitFor, within } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellCountModal } from './cell-count-modal';

/**
 * TZ v3 §2 — «Sanash» oynasi.
 *
 *   §2.1 oddiy rejim — MUTLAQ (`mode:'set'`);
 *   §2.2.3 «Umumiy sanash» — QO'SHILADI (`mode:'add'`), qatorda «hozirgi → bo'ladi»;
 *   §2.2.2 bo'sh qator umumiy sondan to'ldiriladi (saqlash lahzasida);
 *   §2.2.4 birorta qator yaroqsiz bo'lsa — HECH NARSA yozilmaydi va qaysi
 *          yacheyka ekani AYTILADI (yarim-partiya yo'q);
 *   §3   jim rad etish yo'q — tarmoq xatosi «bo'sh yacheyka» bilan aralashmaydi,
 *        har xato shoxi beep + banner beradi, burst'da hech narsa yo'qolmaydi.
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

const { api } = await import('@/lib/api-client');
const { beep } = await import('@/lib/beep');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

interface StockOpts {
  /** Yacheyka-tarkibi so'rovi rad etilsin (tarmoq/500 shoxi). */
  fails?: boolean;
  /** BIRINCHI yacheyka-tarkibi so'rovi `release()` gacha kutadi (burst oynasi). */
  gateFirst?: boolean;
}

/** Har yacheykada bitta mahsulot; qoldiq — `stock` xaritasidan. */
function mockStock(stock: Record<string, number>, opts: StockOpts = {}) {
  const gate: { release: (() => void) | null } = { release: null };
  let gateArmed = !!opts.gateFirst;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const m = url.match(/cells\/(cell-[AB])\/stock/);
    if (m) {
      if (opts.fails) throw new Error('tarmoq yiqildi');
      if (gateArmed) {
        gateArmed = false;
        await new Promise<void>((r) => {
          gate.release = r;
        });
      }
      const cellId = m[1] as string;
      return {
        items: [
          {
            assortmentKind: 'product',
            assortmentId: `prod-${cellId}`,
            name: `Tovar ${cellId}`,
            code: null,
            barcode: null,
            description: null,
            mainImageId: null,
            qty: String(stock[cellId] ?? 0),
          },
        ],
      } as never;
    }
    return { items: [] } as never;
  });
  vi.mocked(api.put).mockResolvedValue({} as never);
  return gate;
}

function open() {
  renderWithProviders(
    <CellCountModal
      open
      onOpenChange={vi.fn()}
      storeId="store-1"
      cells={CELLS}
      onSaved={vi.fn()}
    />,
  );
}

/** Skaner o'qigan kod maydondagi ECHO ni USTIDAN yozadi (komponent har o'qishdan
 *  keyin maydonni fokuslab BELGILAB qo'yadi) — `clear()` aynan shuni takrorlaydi.
 *  Belgilashsiz kodlar bir-biriga yopishib ketardi («01-01-01-01CELLB»). */
const scan = async (code: string) => {
  const input = screen.getByTestId('cell-count-input');
  await userEvent.clear(input);
  await userEvent.type(input, `${code}{Enter}`);
};

const status = () => screen.getByTestId('cell-count-status');

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.put).mockReset();
  vi.mocked(beep).mockClear();
});

describe('CellCountModal — TZ v3 §2', () => {
  it('§2.1 oddiy rejim MUTLAQ yozadi (mode: set)', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await scan('CELLA');
    await waitFor(() => expect(screen.getByTestId('cell-count-qty')).toBeEnabled());

    await userEvent.type(screen.getByTestId('cell-count-qty'), '30');
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'prod-cell-A',
      qty: '30',
      mode: 'set',
    });
  });

  it('§2.2.2 bulk qatorda «hozirgi» va natija ko`rinadi', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');

    const row = await screen.findByTestId('cell-count-bulk-row-cell-A');
    expect(within(row).getByTestId('cell-count-bulk-current-cell-A')).toHaveTextContent('26');
    expect(within(row).getByTestId('cell-count-bulk-becomes-cell-A')).toHaveTextContent('126');
  });

  it('§2.2.3 bulk saqlash QO`SHADI (mode: add) — har yacheykaga o`z soni', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    await scan('CELLB');
    await screen.findByTestId('cell-count-bulk-row-cell-B');

    // B qatoriga alohida 50
    const bQty = screen.getByTestId('cell-count-bulk-qty-cell-B');
    await userEvent.clear(bQty);
    await userEvent.type(bQty, '50');

    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    const bodies = vi.mocked(api.put).mock.calls.map((c) => c[1]);
    expect(bodies).toContainEqual({ assortmentId: 'prod-cell-A', qty: '100', mode: 'add' });
    expect(bodies).toContainEqual({ assortmentId: 'prod-cell-B', qty: '50', mode: 'add' });
  });

  it('§2.2.2 bo`sh qator UMUMIY sondan to`ldiriladi (saqlash lahzasida)', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await scan('CELLA'); // umumiy son hali kiritilmagan — qator bo'sh qty bilan tushadi
    await screen.findByTestId('cell-count-bulk-row-cell-A');

    await userEvent.type(screen.getByTestId('cell-count-qty'), '70');
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'prod-cell-A',
      qty: '70',
      mode: 'add',
    });
  });

  it('§2.2.4 yaroqsiz qator — HECH NARSA yozilmaydi, yacheyka nomi aytiladi', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    await scan('CELLB');
    await screen.findByTestId('cell-count-bulk-row-cell-B');

    const aQty = screen.getByTestId('cell-count-bulk-qty-cell-A');
    await userEvent.clear(aQty);
    await userEvent.type(aQty, 'abc');

    vi.mocked(beep).mockClear();
    await userEvent.click(screen.getByTestId('cell-count-save'));

    expect(api.put).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('01-01-01-01');
    // TZ §3: sabab jim emas — eshitiladi ham.
    expect(beep).toHaveBeenCalled();
  });

  /**
   * BURST (TZ §3 + §2.1 «oldin miqdor»): navbat mikrotaskda drenaj bo'ladi —
   * ikki skan orasida React na re-render qiladi, na passiv effektni yugurtiradi.
   * Agar `resolve()` STATE dan o'qisa, ikkinchi skan birinchisining yacheykasini
   * ko'rmaydi ⇒ «oldin miqdor kiriting» qo'riqchisi ISHLAMAY qoladi va sanalgan,
   * lekin yozilmagan yacheyka JIMGINA almashadi. Birinchi skanning yacheyka
   * so'rovi ataylab ushlab turiladi — ikkinchisi o'sha paytda navbatga tushadi.
   */
  it('§3 BURST — ketma-ket ikkinchi skan tugallanmagan hisobni JIM almashtirmaydi', async () => {
    const gate = mockStock({ 'cell-A': 26, 'cell-B': 5 }, { gateFirst: true });
    open();
    await scan('CELLA'); // yacheyka so'rovida to'xtadi
    await scan('CELLB'); // navbatga tushdi, hali boshlanmadi
    await waitFor(() => expect(gate.release).not.toBeNull());
    gate.release?.();

    await waitFor(() => expect(status()).toHaveTextContent('Oldin miqdor kiriting'));
    expect(beep).toHaveBeenCalled();
    // Ikkinchi yacheyka UMUMAN ochilmagan — birinchisining hisobi joyida.
    const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('cell-B'))).toBe(false);
  });

  it('§3 bulk: yacheyka tarkibi so`rovi YIQILSA — «bo`sh yacheyka» DEYILMAYDI', async () => {
    mockStock({}, { fails: true });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');

    await waitFor(() => expect(status()).toHaveTextContent("o'qib bo'lmadi"));
    expect(status()).not.toHaveTextContent('Yacheyka bo`sh');
    expect(beep).toHaveBeenCalled();
    expect(screen.queryByTestId('cell-count-bulk-rows')).not.toBeInTheDocument();
  });

  it('§3 oddiy rejim: tarkib so`rovi yiqilsa — `onError` banneri + beep (jim emas)', async () => {
    mockStock({}, { fails: true });
    open();
    await scan('CELLA');

    await waitFor(() => expect(status()).toHaveTextContent('tarmoq yiqildi'));
    expect(beep).toHaveBeenCalled();
  });

  it('§3 bulk saqlashda tarmoq xatosi — beep + banner, qatorlar YO`QOLMAYDI', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');

    vi.mocked(api.put).mockRejectedValue(new Error('PUT 500'));
    vi.mocked(beep).mockClear();
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(status()).toHaveTextContent('PUT 500'));
    expect(beep).toHaveBeenCalled();
    expect(screen.getByTestId('cell-count-bulk-row-cell-A')).toBeInTheDocument();
  });
});
