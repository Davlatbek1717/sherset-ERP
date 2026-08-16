/**
 * «Omborga chiqadigan chek» (yig'ish varag'i) chop marshruti — 2026-08-16.
 *
 * 🔴 O'LCHANGAN NOSOZLIK (prod, erp.sherset.uz): «Omborchiga yuborish» bosilgach
 * chek CHIQMASDI — uning o'rniga kichik oyna ochilardi. Ikki qatlam ustma-ust:
 *
 *   1. `GET /restock-tasks/picking-sheets/:source/:id` kiosk ro'yxatida yo'q edi
 *      ⇒ kassir **403** olardi (nginx logida 28 marta) ⇒ `load-failed` ⇒ popup.
 *      Popup sahifasi AYNI endpointni so'raydi — u ham 403, ya'ni chek umuman
 *      yo'q. Bu qatlam api tomonda yopildi (`kiosk-policy.ts`).
 *   2. Hatto 403 tuzatilganda ham: `sklad_keepers` prodda **0 qator** ⇒ hech bir
 *      omborga printer biriktirilmagan ⇒ eski kod `no-printer-mapped` qaytarib
 *      chop etishni BUTUNLAY to'xtatardi (qobiqda sariq ogohlantirish).
 *
 * SHARTNOMA (mijoz cheki bilan AYNI, `2efe572f` qarori + egasining 2026-08-16
 * qarori): chek HAR DOIM **qurilmaning Windows sukut printeriga** bosiladi
 * (`printSheet('')`) — «saytdan hech biriga alohida printer ulanmaydi,
 * kompyuterning o'ziga ulangan printerdan chiqsin». Ombor→printer marshruti
 * butunlay olib tashlandi.
 *
 * Yacheykasiz guruh (`skladNo: null`) alohida ahamiyatga ega: prodda 5064
 * tovardan faqat 561 tasida `__yacheyka` bor (11%), ya'ni varaqlarning ko'pi
 * aynan shu guruhga tushadi va eski kodda ular HECH QACHON chiqmasdi.
 */

import { api } from '@/lib/api-client';
import { printPickingViaAgent } from '@/lib/print-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

function installShell(
  printSheet = vi.fn(
    async (_printerName: string, _html: string, _page?: { width: number; height?: number }) => ({
      ok: true,
    }),
  ),
) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isSherset: true,
    version: '1.9.0',
    listPrinters: async () => ['XP-80C', 'Ombor-1'],
    printSheet,
  };
  return printSheet;
}

const sheet = (skladNo: number | null, productName: string, groupLabel?: string | null) => ({
  skladNo,
  // Sukut — server bitta guruh uchun yuboradigan sarlavha; testda oshkora
  // `null` berish «birlashtirilgan varaq» holatini bildiradi.
  groupLabel:
    groupLabel !== undefined
      ? groupLabel
      : skladNo != null
        ? String(skladNo).padStart(2, '0')
        : 'Yacheykasiz',
  omborchiName: null,
  lines: [{ productName, quantity: '2', binLocation: skladNo != null ? '01-02-03-05' : null }],
});

const res = (sheets: ReturnType<typeof sheet>[]) => ({
  docNumber: 'TPH-7',
  docDate: '2026-08-16T10:00:00.000Z',
  sourceName: 'TPH-7',
  sellerName: 'Org',
  buyerName: 'Mijoz',
  buyerPhone: '',
  comment: '',
  sheets,
});

/**
 * `/restock-tasks/picking-sheets` → varaqlar.
 *
 * 🔴 `/sklad-keepers` chaqirilishi 2026-08-16 dan BUG: sayt printer tanlamaydi,
 * ya'ni marshrut sozlamasi umuman o'qilmasligi kerak. Mock uni jimgina
 * qaytarmaydi, balki OTADI — aks holda regressiya `printSheet('')` bilan
 * ustma-ust tushib ko'rinmay qolardi (chek baribir chiqardi).
 */
function mockApi(sheets: ReturnType<typeof sheet>[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/restock-tasks/picking-sheets/')) return res(sheets);
    if (url.startsWith('/sklad-keepers')) throw new Error('/sklad-keepers chaqirildi');
    throw new Error(`kutilmagan url: ${url}`);
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

afterEach(() => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  vi.unstubAllGlobals();
});

describe('printPickingViaAgent — sozlamasiz ham chek CHIQADI', () => {
  it('🔴 hech bir omborga printer biriktirilmagan ⇒ SUKUT printerga bosiladi', async () => {
    const printSheet = installShell();
    mockApi([sheet(1, 'Rozetka')]);

    const r = await printPickingViaAgent('s-1');

    // Eski xulq: { handled:false, reason:'no-printer-mapped' } — chop YO'Q.
    expect(r).toMatchObject({ handled: true, printed: 1, skipped: 0, errors: 0 });
    expect(r.reason).toBeUndefined();
    // Bo'sh nom = Windows sukut printeri (desktop `main.js` printHtml shartnomasi).
    expect(printSheet).toHaveBeenCalledTimes(1);
    expect(printSheet.mock.calls[0]?.[0]).toBe('');
    expect(printSheet.mock.calls[0]?.[2]).toEqual({ width: 72000 });
  });

  it('🔴 YACHEYKASIZ guruh (skladNo=null) ham chiqadi — prodda tovarlarning 89%i shunday', async () => {
    const printSheet = installShell();
    mockApi([sheet(null, 'Yacheykasiz tovar')]);

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, printed: 1, skipped: 0 });
    expect(printSheet.mock.calls[0]?.[0]).toBe('');
  });

  it('🔴 HAR varaq sukut printerga — printer nomi HECH QACHON uzatilmaydi', async () => {
    // Egasi, 2026-08-16: «saytdan hech biriga alohida printer ulanmaydi».
    const printSheet = installShell();
    mockApi([sheet(1, 'Bir'), sheet(2, 'Ikki'), sheet(null, 'Yacheykasiz')]);

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, printed: 3, skipped: 0, errors: 0 });
    expect(printSheet.mock.calls.map((c) => c[0])).toEqual(['', '', '']);
  });

  it('marshrut sozlamasi UMUMAN so`ralmaydi (`/sklad-keepers`)', async () => {
    installShell();
    mockApi([sheet(1, 'Rozetka')]);

    const r = await printPickingViaAgent('s-1');

    expect(r.handled).toBe(true);
    const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/sklad-keepers'))).toBe(false);
  });

  it('drayver rad etsa `errors` sanaladi (jim yo`qolgan chek bo`lmaydi)', async () => {
    installShell(vi.fn(async () => ({ ok: false, error: 'Printer topilmadi' })));
    mockApi([sheet(1, 'Rozetka')]);

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: true, printed: 0, errors: 1 });
  });
});

/**
 * Sarlavha SERVERDAN keladi (2026-08-16). Ilgari mijoz uni `skladNo` dan
 * hisoblardi (`pickGroupLabel`) — birlashtirilgan varaqda o'sha hisob YOLG'ON
 * bo'lardi: bir necha ombor + yacheykasizlar ustiga «Yacheykasiz» yozilardi.
 */
describe('varaq sarlavhasi — birlashtirilganda CHIQMAYDI', () => {
  it('birlashtirilgan varaq (groupLabel=null) ⇒ sarlavha yo`q, tovarlar bor', async () => {
    const printSheet = installShell();
    mockApi([sheet(null, 'Aralash ro`yxat', null)]);

    await printPickingViaAgent('s-1');

    const html = printSheet.mock.calls[0]?.[1] ?? '';
    expect(html).toContain('Aralash ro`yxat');
    expect(html).not.toContain('class="grp"');
    expect(html).not.toContain('Yacheykasiz');
  });

  it('bitta omborli varaq ⇒ server bergan sarlavha chiqadi', async () => {
    const printSheet = installShell();
    mockApi([sheet(1, 'Rozetka')]);

    await printPickingViaAgent('s-1');

    expect(printSheet.mock.calls[0]?.[1]).toContain('<div class="grp">01</div>');
  });
});

describe('printPickingViaAgent — uzilish sabablari', () => {
  it('varaqlarning O`ZI yuklanmasa — chop yo`q, sabab load-failed', async () => {
    installShell();
    vi.mocked(api.get).mockRejectedValue(new Error('500'));

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: false, reason: 'load-failed' });
  });

  it('qobiq ham, agent ham yo`q ⇒ no-agent (brauzer-zaxira chaqiruvchida)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const r = await printPickingViaAgent('s-1');

    expect(r).toMatchObject({ handled: false, reason: 'no-agent' });
    expect(api.get).not.toHaveBeenCalled();
  });
});
