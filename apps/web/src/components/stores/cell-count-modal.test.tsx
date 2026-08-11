import uz from '@/messages/uz.json';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellCountModal } from './cell-count-modal';

/**
 * TZ v3 §2 — «Sanash» oynasi.
 *
 *   §2   tepada BITTA son-maydon — rejim almashganda joyidan qimirlamaydi;
 *   §2.1 oddiy rejim — MUTLAQ (`mode:'set'`);
 *   §2.2.3 «Umumiy sanash» — QO'SHILADI (`mode:'add'`), qatorda «hozirgi → bo'ladi»;
 *   §2.2.2 bo'sh qator umumiy sondan to'ldiriladi (saqlash lahzasida);
 *   §2.2.4 birorta qator yaroqsiz bo'lsa — HECH NARSA yozilmaydi va qaysi
 *          yacheyka ekani AYTILADI (yarim-partiya yo'q);
 *   §3   jim rad etish/jim YO'QOTISH yo'q — tarmoq xatosi «bo'sh yacheyka» bilan
 *        aralashmaydi, ochilmagan yacheyka EKRANDA QOLMAYDI, staged ro'yxat
 *        rejim almashuvida yo'qolmaydi, burst'da hech narsa yo'qolmaydi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/beep', () => ({ beep: vi.fn() }));
// `normalizeScanInput` `resolve()` ning ichki xato-shoxlaridan TASHQARIDA
// chaqiriladi — bu yerdan otilgan yagona sentinel (`BOOM`) `useScanQueue.onError`
// yo'lini qoplaydi. Qolgan hamma kirish HAQIQIY funksiyaga uzatiladi.
vi.mock('@/lib/scan', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/scan')>();
  return {
    normalizeScanInput: vi.fn((raw: string) => {
      if (raw === 'BOOM') throw new Error('normalize portladi');
      return real.normalizeScanInput(raw);
    }),
  };
});
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

/** Tarjima qiymatlari testga AYNAN shu yerdan keladi — qo'lda ko'chirilgan matn
 *  apostrof farqi tufayli jimgina hech narsaga mos kelmasligi mumkin edi. */
const T = uz.pages.stores.address_storage;

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

interface StockOpts {
  /** HAR QANDAY yacheyka-tarkibi so'rovi rad etilsin (tarmoq/500 shoxi). */
  fails?: boolean;
  /** FAQAT shu yacheykalar so'rovi rad etilsin (ikkinchi skan yiqiladigan holat). */
  failCells?: string[];
  /** BIRINCHI yacheyka-tarkibi so'rovi `release()` gacha kutadi (burst oynasi). */
  gateFirst?: boolean;
}

/** Har yacheykada bitta mahsulot; qoldiq — `stock` xaritasidan. Qiymat MATN ham
 *  bo'lishi mumkin: server buzuq/parse bo'lmaydigan son qaytargan holat. */
function mockStock(stock: Record<string, number | string>, opts: StockOpts = {}) {
  const gate: { release: (() => void) | null } = { release: null };
  let gateArmed = !!opts.gateFirst;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const m = url.match(/cells\/(cell-[AB])\/stock/);
    if (m) {
      if (opts.fails || opts.failCells?.includes(m[1] as string)) {
        throw new Error('tarmoq yiqildi');
      }
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

/** Wedge-skaner yo'li: kod FOKUSDAGI elementga «teriladi» va Enter bilan
 *  yakunlanadi — tugma ustida ham, son-maydoni ustida ham xuddi shunday. */
function wedgeScan(code: string) {
  const target = document.activeElement ?? document.body;
  for (const ch of code) fireEvent.keyDown(target, { key: ch });
  fireEvent.keyDown(target, { key: 'Enter' });
}

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

  it('§2.2.2 server soni buzuq bo`lsa ham «bo`ladi» NaN chiqarmaydi', async () => {
    mockStock({ 'cell-A': 'n/a' });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');

    const row = await screen.findByTestId('cell-count-bulk-row-cell-A');
    expect(within(row).getByTestId('cell-count-bulk-current-cell-A')).toHaveTextContent('0');
    expect(within(row).getByTestId('cell-count-bulk-becomes-cell-A')).toHaveTextContent('100');
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

    await waitFor(() => expect(status()).toHaveTextContent(T.scan_cell_contents_failed));
    // «Bo'sh» matni i18n qiymatining O'ZI bilan solishtiriladi — qo'lda ko'chirilgan
    // matn apostrof farqi tufayli hech qachon mos kelmasdi (vakuum tasdiq).
    expect(status()).not.toHaveTextContent(T.count_empty);
    expect(beep).toHaveBeenCalled();
    expect(screen.queryByTestId('cell-count-bulk-rows')).not.toBeInTheDocument();
  });

  /**
   * CRITICAL: `applyCell(target)` `loadItems` dan OLDIN ishlaydi. Agar yangi
   * yacheykaning tarkibi YIQILSA va eski holat tozalanmasa — ekranda YANGI
   * yacheyka nomi, ESKI yacheykaning kartochkasi va ESKI son turadi, «Saqlash»
   * esa `PUT cells/B/stock {assortmentId: A ning mahsuloti, mode:'set'}` yuboradi:
   * boshqa yacheykaning qoldig'i boshqa mahsulot bilan MUTLAQ qilib yoziladi.
   */
  it('§3 yacheyka OCHILMASA — eski kartochka/son qolmaydi va yozuv KETMAYDI', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 }, { failCells: ['cell-B'] });
    open();
    await scan('CELLA');
    await waitFor(() =>
      expect(screen.getByTestId('cell-count-card-prod-cell-A')).toBeInTheDocument(),
    );
    await userEvent.type(screen.getByTestId('cell-count-qty'), '30');
    vi.mocked(beep).mockClear();

    await scan('CELLB'); // B ning tarkibi yiqiladi

    // Uchinchi holat KO'RINADI: «ochilmadi» — «bo'sh» ham, «yuklanmoqda» ham emas.
    await waitFor(() => expect(screen.getByTestId('cell-count-cell-error')).toBeInTheDocument());
    expect(screen.getByTestId('cell-count-cell-error')).toHaveTextContent('01-01-01-02');
    expect(screen.queryByTestId('cell-count-empty')).not.toBeInTheDocument();
    // A ning kartochkasi ham, uning soni ham qolmaydi.
    expect(screen.queryByTestId('cell-count-card-prod-cell-A')).not.toBeInTheDocument();
    expect(screen.getByTestId('cell-count-qty')).toHaveValue('');
    expect(beep).toHaveBeenCalled();
    // Eng muhimi — bu holatdan hech qanday yozuv chiqmaydi.
    expect(screen.getByTestId('cell-count-save')).toBeDisabled();
    await userEvent.click(screen.getByTestId('cell-count-save'));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('§3 `onError` yo`li — kutilmagan xato JIM yutilmaydi (banner + beep + tafsilot)', async () => {
    mockStock({});
    open();
    await scan('BOOM');

    await waitFor(() => expect(status()).toHaveTextContent(T.count_scan_failed));
    expect(screen.getByTestId('cell-count-status-detail')).toHaveTextContent('normalize portladi');
    expect(beep).toHaveBeenCalled();
  });

  it('§3 bulk saqlashda tarmoq xatosi — odam matni + texnik tafsilot, qatorlar YO`QOLMAYDI', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');

    vi.mocked(api.put).mockRejectedValue(new Error('Request failed with status code 500'));
    vi.mocked(beep).mockClear();
    await userEvent.click(screen.getByTestId('cell-count-save'));

    // Omborchiga — odam gapi; xom `err.message` faqat kichik tafsilot qatorida.
    await waitFor(() => expect(status()).toHaveTextContent(T.count_save_failed));
    expect(status()).not.toHaveTextContent('status code 500');
    expect(screen.getByTestId('cell-count-status-detail')).toHaveTextContent('status code 500');
    expect(beep).toHaveBeenCalled();
    expect(screen.getByTestId('cell-count-bulk-row-cell-A')).toBeInTheDocument();
  });

  it('§3 bulk QISMAN saqlanish — «yozildi: k / N» aytiladi, yozilgani ro`yxatdan ketadi', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '10');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    await scan('CELLB');
    await screen.findByTestId('cell-count-bulk-row-cell-B');

    // Saqlash skan tartibida ketadi: avval A (o'tadi), keyin B (yiqiladi).
    vi.mocked(api.put).mockReset();
    vi.mocked(api.put)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('PUT 500'));
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(status()).toHaveTextContent('1 / 2'));
    expect(screen.queryByTestId('cell-count-bulk-row-cell-A')).not.toBeInTheDocument();
    expect(screen.getByTestId('cell-count-bulk-row-cell-B')).toBeInTheDocument();
  });

  it('§2.2 qayta skan mavjud qatorni ALMASHTIRMAYDI — tahrirlangan son saqlanadi', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');

    const aQty = screen.getByTestId('cell-count-bulk-qty-cell-A');
    await userEvent.clear(aQty);
    await userEvent.type(aQty, '50');
    vi.mocked(beep).mockClear();

    await scan('CELLA'); // o'sha yacheyka yana skanlandi

    // «allaqachon ro'yxatda» — NA «Qo'shildi» (yolg'on bo'lardi).
    await waitFor(() => expect(status()).toHaveTextContent('allaqachon'));
    expect(status()).toHaveTextContent('01-01-01-01');
    expect(status()).not.toHaveTextContent(T.count_bulk_added.replace('{name}', ''));
    expect(beep).toHaveBeenCalled();
    // Qo'lda qo'yilgan 50 JOYIDA — umumiy 100 ga qaytmaydi.
    expect(screen.getByTestId('cell-count-bulk-qty-cell-A')).toHaveValue('50');
    expect(screen.getAllByTestId(/^cell-count-bulk-row-/)).toHaveLength(1);

    await userEvent.click(screen.getByTestId('cell-count-save'));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'prod-cell-A',
      qty: '50',
      mode: 'add',
    });
  });

  it('§3 bulk→oddiy rejimga o`tish staged ro`yxatni JIM tashlamaydi', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    vi.mocked(beep).mockClear();

    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));

    await waitFor(() => expect(status()).toHaveTextContent('1 ta yacheyka bor'));
    expect(beep).toHaveBeenCalled();
    // Rejim ALMASHMADI va qator joyida — hech narsa yo'qolmadi.
    expect(screen.getByTestId('cell-count-bulk-toggle')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('cell-count-bulk-row-cell-A')).toBeInTheDocument();
  });

  it('§2 son-maydon BITTA — rejim almashganda AYNI o`sha tugun qoladi', async () => {
    mockStock({});
    open();
    expect(screen.getAllByTestId('cell-count-qty')).toHaveLength(1);
    expect(screen.queryByTestId('cell-count-bulk-qty')).not.toBeInTheDocument();
    const before = screen.getByTestId('cell-count-qty');

    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));

    expect(screen.getAllByTestId('cell-count-qty')).toHaveLength(1);
    expect(screen.queryByTestId('cell-count-bulk-qty')).not.toBeInTheDocument();
    // Aynan o'sha DOM tuguni: React uni qayta yaratmagan ⇒ maydon joyidan
    // qimirlamaydi, fokus/kursor ham saqlanadi.
    expect(screen.getByTestId('cell-count-qty')).toBe(before);
    expect(before).toHaveAttribute('placeholder', '50');
  });

  /**
   * TZ §3 kirish yo'li 1 — «kursor QAYERDA bo'lishidan qat'i nazar ishlaydi».
   * Review 2026-08-10 (I3): document-darajasidagi tutqich faqat «Scan» oynasida
   * bor edi, ya'ni ✕ / «Kamera» / checkbox bosilgach fokus TUGMADA qolar va
   * wedge-skaner kodi hech qayerga tushmasdi — jim yo'qolish.
   */
  it('§3 fokus TUGMADA bo`lsa ham wedge-skan ishlaydi', async () => {
    mockStock({ 'cell-A': 5 });
    open();
    // Omborchi «Kamera» tugmasini bosdi — fokus o'sha yerda qoldi.
    const camera = screen.getByTestId('cell-count-camera');
    camera.focus();
    expect(document.activeElement).toBe(camera);

    wedgeScan('CELLA');

    await waitFor(() => expect(status()).toHaveTextContent('01-01-01-01'));
  });

  /**
   * Ikkinchi yuzi: son-maydoni `INPUT`, ya'ni hujjat tutqichi uni CHETLAB
   * o'tishi shart — aks holda bitta burst IKKI marta (hook + `wedgeGuard`)
   * navbatga tushardi va yacheyka ikki marta ochilardi.
   */
  it('§3 son-maydonidagi burst FAQAT `wedgeGuard` orqali ketadi (ikki marta emas)', async () => {
    mockStock({ 'cell-A': 5 });
    open();
    const qty = screen.getByTestId('cell-count-qty');
    qty.focus();

    wedgeScan('CELLA');

    await waitFor(() => expect(status()).toHaveTextContent('01-01-01-01'));
    const stockCalls = vi
      .mocked(api.get)
      .mock.calls.filter(([u]) => String(u).includes('cell-A/stock'));
    expect(stockCalls).toHaveLength(1);
    // Skan qoldig'i maydonda QOLMAYDI — `wedgeGuard` uni orqaga qaytargan.
    expect(qty).toHaveValue('');
  });
});
