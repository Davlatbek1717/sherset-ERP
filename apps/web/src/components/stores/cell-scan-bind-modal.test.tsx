import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellScanBindModal } from './cell-scan-bind-modal';

/**
 * TZ v3 §1/§3 — «Scan» oynasi (yacheyka ↔ mahsulot bog'lash).
 *
 * Bu oynada bugungacha BIRORTA test yo'q edi (700+ qator). Qulflangan xulqlar:
 *   §1.2 band yacheyka tugmalarida mahsulot NOMI turadi;
 *   §1.2 «chiqarib qo'shish» — chiqarish ham faqat «Saqlash» paytida
 *        (avval DELETE, keyin POST);
 *   §1.2 qaror HAR YACHEYKA UCHUN BIR MARTA (lekin BOSHQA yacheykada qayta);
 *   §1.2 chiqariladiganlar — qaror lahzasidagi SERVER tarkibi;
 *   §1.2 fikrdan qaytish · ✕ qarorni ham tozalaydi · qisman saqlash xabari;
 *   §1.3 ko'p yacheyka — har guruh o'z yacheykasiga yoziladi;
 *   §1.4 staged dublikat (burst holida ham) — sariq, qator qo'shilmaydi;
 *   §3   dialog ochiqda skan JIM yutilmaydi · so'rov xatosi qaror muhrlamaydi ·
 *        xatolarda beep · `onError` yo'li (banner + beep);
 *   §3   chiqarish huquqi yo'q bo'lsa tugma ko'rinmaydi.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/beep', () => ({ beep: vi.fn() }));
// `normalizeScanInput` — `resolve()` ning try/catch idan TASHQARIDA chaqiriladi,
// ya'ni bu yerdan otilgan xato faqat `useScanQueue.onError` orqali ko'rinadi.
// Aynan shu yo'lni qoplash uchun BITTA sentinel kod (`BOOM`) otadi; qolgan
// hamma kirish HAQIQIY funksiyaga uzatiladi, ya'ni `/scan?c=…` peel shoxi ham
// haqiqiy kod bilan sinaladi (mock uni yashirib qo'ymaydi).
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
// TZ §3: chiqarish huquqi (`store.update`) — default holatda BOR (administrator).
// Oxirgi test uni bir holat uchun 'NO' ga tushiradi.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ matrix: { store: { update: 'ALL' } } })),
}));

const { api } = await import('@/lib/api-client');
const { beep } = await import('@/lib/beep');
const { usePermissions } = await import('@/hooks/use-permissions');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

interface MockOpts {
  occupants: Array<{ id: string; name: string }>;
  /** Yacheyka tarkibi so'rovi rad etilsin (CRITICAL-2 shoxi). */
  contentsFails?: boolean;
  /** Yacheyka tarkibi so'rovining BIRINCHISI shu promise'gacha kutadi (burst). */
  gateFirstContents?: boolean;
}

/** `/products?search=…` → bitta aniq mahsulot; cells/:id/products → band tarkib. */
function mockApi({ occupants, contentsFails, gateFirstContents }: MockOpts) {
  const gate: { release: (() => void) | null } = { release: null };
  let gateArmed = !!gateFirstContents;
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
    if (url.includes('/products')) {
      if (contentsFails) throw new Error('yacheyka tarkibi 500');
      if (gateArmed) {
        gateArmed = false;
        await new Promise<void>((r) => {
          gate.release = r;
        });
      }
      return { items: occupants } as never;
    }
    return { cells: [] } as never;
  });
  vi.mocked(api.post).mockResolvedValue({} as never);
  vi.mocked(api.delete).mockResolvedValue({} as never);
  return gate;
}

function open() {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <CellScanBindModal
      open
      onOpenChange={onOpenChange}
      storeId="store-1"
      cells={CELLS}
      initialCell={null}
      onBound={vi.fn()}
    />,
  );
  return { onOpenChange };
}

async function scan(code: string) {
  const input = screen.getByTestId('cell-scan-input');
  await userEvent.type(input, `${code}{Enter}`);
}

/** Keyboard-wedge yo'li: fokus qayerda bo'lishidan qat'i nazar ishlaydi —
 *  modal dialog ochiq turganda ham skaner AYNAN shunday «yozadi». */
function wedgeScan(code: string) {
  for (const ch of code) fireEvent.keyDown(document.body, { key: ch });
  fireEvent.keyDown(document.body, { key: 'Enter' });
}

const logRows = () => screen.getByTestId('cell-scan-log').querySelectorAll('li');

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
  vi.mocked(beep).mockClear();
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

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-replace')).toHaveTextContent('Olma +1');
  });

  it('§1.2 «chiqarib qo`shish» — saqlashda AVVAL delete, KEYIN post', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('cell-scan-replace'));
    // Skan paytida SERVERGA hech narsa yozilmaydi.
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    // §1.2: qator «almashtiradi» belgisi bilan turadi.
    expect(screen.getByTestId(/^cell-scan-row-replaces-/)).toHaveTextContent('almashtiradi');

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
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));

    await scan('X2');

    // Dialog qayta OCHILMAYDI, ikkinchi qator ro'yxatga jimgina tushadi.
    await waitFor(() => expect(logRows()).toHaveLength(2));
    expect(screen.queryByTestId('cell-scan-conflict-msg')).not.toBeInTheDocument();
  });

  /**
   * `evict` ro'yxati — qaror qabul qilingan lahzadagi SERVER tarkibi. Agar u
   * saqlash paytida «yacheykaning hozirgi mazmuni» sifatida qayta hisoblansa
   * (yoki staged qatorlarni ham qamrasa), foydalanuvchi shu sessiyada
   * qo'shgan qatorlar o'zini-o'zi chiqarib yuborardi.
   */
  it('§1.2 chiqarish faqat SERVER tarkibiga tegadi — staged qatorlar chiqarilmaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));

    // Ikkinchi mahsulot — qaror eslab qolingani uchun jimgina staged bo'ladi.
    await scan('X2');
    await waitFor(() => expect(logRows()).toHaveLength(2));

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-A/products/prod-old');
  });

  it('§1.3 BOSHQA yacheyka qayta so`raydi va har guruh O`Z yacheykasiga yoziladi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));

    await scan('CELLB');
    await scan('X2');
    // cell-A qarori cell-B ga KO'CHMAYDI — savol qaytadan beriladi.
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));
    await waitFor(() => expect(logRows()).toHaveLength(2));

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-A/products', {
      productIds: ['prod-X1'],
    });
    expect(api.post).toHaveBeenCalledWith('/admin/stores/store-1/cells/cell-B/products', {
      productIds: ['prod-X2'],
    });
  });

  it('§1.4 staged dublikat — sariq «ro`yxatda bor», qator qo`shilmaydi + beep', async () => {
    mockApi({ occupants: [] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(logRows()).toHaveLength(1));
    vi.mocked(beep).mockClear();

    await scan('X1');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('allaqachon ro'),
    );
    expect(logRows()).toHaveLength(1);
    expect(beep).toHaveBeenCalled();
  });

  /**
   * BURST (TZ §3): navbat mikrotaskda drenaj bo'ladi — ikki skan orasida React
   * na re-render qiladi, na passiv effektni yugurtiradi. Agar `resolve()` state
   * o'qisa, ikkinchi skan BIRINCHISINI ko'rmaydi ⇒ bitta mahsulot ikki qator va
   * ikki POST bo'lardi. Birinchi skanning yacheyka-so'rovi ataylab ushlab
   * turiladi, ikkinchisi esa o'sha paytda navbatga tushadi — shunda ikkinchi
   * handler birinchisidan KEYIN darhol, render'siz ishga tushadi.
   */
  it('§1.4 BURST — ketma-ket ikki bir xil skan bitta qator beradi', async () => {
    const gate = mockApi({ occupants: [], gateFirstContents: true });
    open();
    await scan('CELLA');
    await scan('X1'); // navbatda: yacheyka-so'rovida to'xtadi
    await scan('X1'); // navbatga tushdi, hali boshlanmadi
    await waitFor(() => expect(gate.release).not.toBeNull());
    gate.release?.();

    await waitFor(() => expect(logRows()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('allaqachon ro'),
    );
    expect(logRows()).toHaveLength(1);
  });

  it('§3 dialog ochiqda kelgan skan JIM yutilmaydi va savolni USTIDAN YOZMAYDI', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    vi.mocked(beep).mockClear();

    // Savolga javob berilmagan — skaner yana o'qidi (wedge yo'li).
    wedgeScan('X2');

    // Xabar DIALOG ICHIDA — asosiy oynadagi banner overlay ostida qoladi.
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-conflict-refusal')).toHaveTextContent('Avval'),
    );
    expect(beep).toHaveBeenCalledTimes(1);

    // Savol HAMON birinchi skan uchun: javob berilsa ro'yxatga X1 tushadi, X2 emas.
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));
    await waitFor(() => expect(logRows()).toHaveLength(1));
    expect(screen.getByTestId('cell-scan-log')).toHaveTextContent('Tovar X1');
    expect(screen.getByTestId('cell-scan-log')).not.toHaveTextContent('Tovar X2');
    // Dialog yopilgach rad-etish xabari ham ketadi (eskirgan matn qolmaydi).
    expect(screen.queryByTestId('cell-scan-conflict-refusal')).not.toBeInTheDocument();
  });

  /**
   * Kamera bir xil etiketkani ramkada turganida har ~2.5s qayta uzatadi
   * (`useBarcodeCamera` dedupi kod bo'yicha). Har uzatishda beep qilish —
   * javobni o'ylayotgan odam uchun metronom. Takroriy KOD jim, YANGI kod esa
   * baland: matn baribir ekranda turadi, ya'ni hech narsa yashirilmaydi.
   */
  it('§3 dialog ochiqda TAKRORIY kod jim, YANGI kod esa beep qiladi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());

    wedgeScan('X2');
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-conflict-refusal')).toBeInTheDocument(),
    );
    vi.mocked(beep).mockClear();

    wedgeScan('X2'); // kamera takrori — jim
    wedgeScan('X2');
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-conflict-refusal')).toBeInTheDocument(),
    );
    expect(beep).not.toHaveBeenCalled();

    wedgeScan('X3'); // BOSHQA kod — baland
    await waitFor(() => expect(beep).toHaveBeenCalledTimes(1));
  });

  it('haqiqiy `normalizeScanInput` — `/scan?c=…` deep-link kodi peel qilinadi', async () => {
    mockApi({ occupants: [] });
    open();
    await scan('/scan?c=CELLA');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('01-01-01-01'),
    );
    expect(screen.getByTestId('cell-scan-cell-card')).toHaveTextContent('01-01-01-01');
  });

  it('§3 yacheyka tarkibi so`rovi YIQILSA — qaror muhrlanmaydi, qator qo`shilmaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }], contentsFails: true });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('tarkibini'),
    );
    expect(beep).toHaveBeenCalled();
    expect(screen.queryByTestId('cell-scan-log')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cell-scan-conflict-msg')).not.toBeInTheDocument();

    // Qaror MUHRLANMAGAN: so'rov tuzalganda savol baribir beriladi.
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
  });

  it('§3 topilmagan kod — qizil banner + beep', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/products?search=')) return { items: [] } as never;
      return { cells: [] } as never;
    });
    open();
    await scan('YO`Q');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('topilmadi'),
    );
    expect(beep).toHaveBeenCalled();
  });

  it('§3 `onError` yo`li — handler tutilmagan xato otsa banner + beep chiqadi', async () => {
    mockApi({ occupants: [] });
    open();
    await scan('BOOM');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('normalize portladi'),
    );
    expect(beep).toHaveBeenCalled();
  });

  it('§1.2 chiqariladigan mahsulot QAYTA skanlansa — u QOLADI, belgi yo`qoladi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));
    await waitFor(() => expect(screen.getByTestId(/^cell-scan-row-replaces-/)).toBeInTheDocument());

    // Omborchi fikridan qaytdi: «Olma» ni qayta skanladi ⇒ u qolsin.
    await scan('old');

    await waitFor(() => expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('QOLADI'));
    expect(screen.queryByTestId(/^cell-scan-row-replaces-/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('cell-scan-save'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('§1.2 oxirgi qatorni ✕ bilan olib tashlash QARORNI ham bekor qiladi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));
    await waitFor(() => expect(logRows()).toHaveLength(1));

    const unstage = screen.getByLabelText("Ro'yxatdan olib tashlash");
    await userEvent.click(unstage);
    await waitFor(() => expect(screen.queryByTestId('cell-scan-log')).not.toBeInTheDocument());

    // Qaror o'chgan: keyingi skan yana SO'RAYDI (jimgina «replace» bo'lmaydi).
    await scan('X2');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
  });

  it('§3 DELETE o`tib POST yiqilsa — xabar «chiqarildi» ni ATAYDI, qayta saqlash takror DELETE qilmaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));

    vi.mocked(api.post).mockRejectedValueOnce(new Error('tarmoq uzildi'));
    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('ALLAQACHON chiqarildi'),
    );
    expect(api.delete).toHaveBeenCalledTimes(1);
    // Qator ro'yxatda QOLDI — qayta urinish mumkin.
    expect(logRows()).toHaveLength(1);
    // Chiqarish bajarilgan ⇒ «almashtiradi» belgisi YOLG'ON bo'lib qolmaydi.
    expect(screen.queryByTestId(/^cell-scan-row-replaces-/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('cell-scan-save'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    // Takroriy DELETE ketmadi.
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  /**
   * N-1 ning ikkinchi yuzi: chiqarish bajarilgandan keyin o'sha yacheykaga
   * skanlangan YANGI qatorda ham belgi turmasligi kerak (muhr `together` ga
   * tushgani uchun) — aks holda omborchi «bu ham nimanidir chiqaradi» deb
   * o'ylab qolardi.
   */
  it('§1.2 chiqarishdan keyin qo`shilgan YANGI qatorda belgi YO`Q', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-replace'));

    vi.mocked(api.post).mockRejectedValueOnce(new Error('tarmoq uzildi'));
    await userEvent.click(screen.getByTestId('cell-scan-save'));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));

    // Server endi bo'sh (chiqarildi) — yangi skan jimgina qo'shiladi.
    mockApi({ occupants: [] });
    await scan('X2');
    await waitFor(() => expect(logRows()).toHaveLength(2));
    expect(screen.queryByTestId(/^cell-scan-row-replaces-/)).not.toBeInTheDocument();
  });

  /**
   * TZ §1.1 b.5: «Muvaffaqiyat: „Saqlandi: N ta bog'lash" va oyna yopiladi».
   * «Sanash» oynasi buni qilardi, «Scan» — yo'q (review 2026-08-10 I2): omborchi
   * saqlagach oyna ochiq qolar, ro'yxat bo'shab turar va «yozildimi?» degan savol
   * tug'ilardi (qayta «Saqlash» — endi bo'sh ro'yxat bilan — hech narsa qilmasdi).
   */
  it('§1.1 b.5 TO`LIQ saqlanganda oyna YOPILADI', async () => {
    mockApi({ occupants: [] });
    const { onOpenChange } = open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(logRows()).toHaveLength(1));

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  /** Qisman yiqilishda oyna YOPILMASLIGI shart — yozilmagan qatorlar ekranda
   *  qolsin va «Saqlash» qayta bosilsin (§1.4 oxirgi qatori). */
  it('§1.1 b.5 QISMAN yiqilishda oyna YOPILMAYDI (qolgan qator ko`rinib turadi)', async () => {
    mockApi({ occupants: [] });
    const { onOpenChange } = open();
    await scan('CELLA');
    await scan('X1');
    await scan('X2');
    await waitFor(() => expect(logRows()).toHaveLength(2));

    // Birinchi qator yoziladi, ikkinchisi yiqiladi.
    vi.mocked(api.post)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('tarmoq uzildi'));
    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('tarmoq uzildi'),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(logRows()).toHaveLength(1);
  });

  it('§3 chiqarish huquqi yo`q foydalanuvchida «chiqarib qo`shish» KO`RINMAYDI', async () => {
    vi.mocked(usePermissions).mockReturnValue({
      matrix: { store: { update: 'NO' } },
    } as never);

    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict-msg')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-add-together')).toBeInTheDocument();
    expect(screen.queryByTestId('cell-scan-replace')).not.toBeInTheDocument();
  });
});
