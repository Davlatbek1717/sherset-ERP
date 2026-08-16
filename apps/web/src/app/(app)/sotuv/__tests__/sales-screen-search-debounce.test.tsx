/**
 * POS qidiruv unumdorligi (2026-08-16 diagnoz: sekinlik DB emas, frontend
 * zanjiri edi — har tugma-bosishda so'rov + har harfda «Yuklanmoqda…» +
 * bekor qilinmaydigan so'rovlar navbati).
 *
 * Bu fayl uch shartnomani qulflaydi:
 *   1. DEBOUNCE — oraliq prefikslar uchun so'rov KETMAYDI (faqat yakuniy matn).
 *   2. KO'RINISH — yangi qidiruv paytida setka ESKI natijani ushlab turadi;
 *      «Yuklanmoqda…» faqat birinchi yuklanishda.
 *   3. ENTER (skaner) — natija hali kelmagan bo'lsa Enter YO'QOLMAYDI va eski
 *      ro'yxatdagi NOTO'G'RI tovar ham qo'shilmaydi: so'rov darhol otiladi
 *      (flush) va AYNAN yangi matn natijasining birinchisi savatga tushadi.
 *   4. So'rovga AbortSignal uzatiladi (react-query eskirganini bekor qiladi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { PRODUCT, PRODUCTS, norm, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  isKioskUser: () => false,
  useAuth: () => ({
    user: { id: 'u-1', name: 'Kassir Aliyev' },
    accessToken: 't',
    initialized: true,
  }),
  getAccessToken: () => 't',
  refresh: async () => false,
}));

vi.mock('@/lib/print-agent', () => ({
  hasNativePrinting: vi.fn(() => false),
  fetchAgentPrinters: vi.fn(async () => []),
  printReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printPickingViaAgent: vi.fn(async () => ({ handled: true, printed: 1, skipped: 0, errors: 0 })),
  printZReportViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  window.localStorage.clear();
});

/** Tovar-ro'yxat so'rovlarining yo'llari (boshqa endpointlar chiqarib tashlanadi). */
function productCalls(): string[] {
  return vi
    .mocked(api.get)
    .mock.calls.map((c) => c[0] as string)
    .filter((p) => p.startsWith('/products?'));
}

describe('POS qidiruv — debounce + keepPreviousData + abort', () => {
  it('oraliq prefikslar uchun so‘rov KETMAYDI — faqat boshlang‘ich va yakuniy matn', async () => {
    // `delay: null` — matn bir zumda teriladi; debounce oynasi (~250ms) ichida
    // qolish uchun. (Mashina tezligiga bog'liq «aynan N ta» assert emas —
    // aksincha: prefiks-so'rov YO'QLIGI tekshiriladi, bu esa terish debounce
    // oynasidan tez bo'lgan har qanday muhitda deterministik.)
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    await user.type(screen.getByTestId('sotuv-search'), 'kab');

    // Debounce tugashini va yakuniy so'rovni kutamiz.
    await waitFor(() => expect(productCalls().some((p) => p.includes('search=kab'))).toBe(true));

    const paths = productCalls();
    // Boshlang'ich (bo'sh matn) so'rovi bor…
    expect(paths.some((p) => p.includes('search=&'))).toBe(true);
    // …lekin «k» va «ka» prefikslari uchun so'rov YO'Q.
    expect(paths.some((p) => p.includes('search=k&'))).toBe(false);
    expect(paths.some((p) => p.includes('search=ka&'))).toBe(false);
  });

  it('yangi qidiruv paytida setka ESKI natijani ko‘rsatib turadi, «Yuklanmoqda…» chiqmaydi', async () => {
    // «kab» javobini qo'lda boshqariladigan promise qilamiz — javob kelmaguncha
    // ekran holatini tekshirish deterministik bo'ladi.
    let resolveKab: (v: unknown) => void = () => {};
    const kabResponse = new Promise((r) => {
      resolveKab = r;
    });
    vi.mocked(api.get).mockImplementation(
      router(salesRoutes([{ match: /^\/products\?search=kab/, value: () => kabResponse }])),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    await user.type(screen.getByTestId('sotuv-search'), 'kab');
    // So'rov ketdi (debounce o'tdi), javob esa hali YO'Q…
    await waitFor(() => expect(productCalls().some((p) => p.includes('search=kab'))).toBe(true));

    // …va setka hamon eski 2 tovarni ko'rsatib turibdi — spinner YO'Q.
    expect(screen.getAllByTestId('sotuv-product')).toHaveLength(2);
    expect(screen.queryByText('Yuklanmoqda…')).not.toBeInTheDocument();

    // Javob kelgach setka yangilanadi.
    resolveKab({ items: [PRODUCT()], total: 1 });
    await waitFor(() => expect(screen.getAllByTestId('sotuv-product')).toHaveLength(1));
  });

  it('🔴 skaner-oqimi: natija kelmasidan Enter — YANGI matn natijasi qo‘shiladi, eski ro‘yxatdagi emas', async () => {
    // «roz» faqat Rozetkani qaytaradi. Skaner matnni terib DARHOL Enter yuboradi
    // — natija hali yo'q. Xavfli regressiya: keepPreviousData bilan Enter eski
    // (to'liq) ro'yxatning birinchisini — Kabelni — qo'shib yuborishi mumkin edi.
    const rozetka = PRODUCT({
      id: 'p-2',
      name: 'Rozetka Legrand',
      code: 'R-002',
      buyPrice: '300000',
      salePrices: PRODUCTS.items[1]?.salePrices,
    });
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([{ match: /^\/products\?search=roz/, value: { items: [rozetka], total: 1 } }]),
      ),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    // Terish + Enter — natijani KUTMASDAN (skaner xulqi).
    await user.type(screen.getByTestId('sotuv-search'), 'roz{Enter}');

    const line = await screen.findByTestId('sotuv-cart-line');
    expect(norm(line.textContent)).toContain('Rozetka Legrand');
    expect(norm(line.textContent)).not.toContain('Kabel');
  });

  it('tovar so‘roviga AbortSignal uzatiladi (eskirgan so‘rov bekor qilinishi uchun)', async () => {
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    const call = vi
      .mocked(api.get)
      .mock.calls.find((c) => (c[0] as string).startsWith('/products?'));
    const opts = call?.[1] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });
});
