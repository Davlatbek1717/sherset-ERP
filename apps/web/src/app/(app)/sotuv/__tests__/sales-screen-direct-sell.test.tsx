/**
 * P3 — TO'G'RIDAN-TO'G'RI SOTISH (yig'ishsiz) · egasi qarori 2026-08-12.
 *
 * 🔴 O'LCHANGAN MUAMMO: savatning YAGONA tugmasi «Omborchiga yuborish» edi —
 * ya'ni HAR sotuv omborchi zanjiridan o'tishi shart edi. Prodda esa
 * `sklad_keepers` jadvalida 0 qator: yig'ish topshirig'i umuman yaratilmasdi
 * va chek «Jarayonda» da qolardi (4 ta shunday chek o'lchandi). Bitta rozetka
 * sotish uchun ham omborchi kutish real savdoni to'xtatadi.
 *
 * Bu fayl yangi yo'lning shartnomalarini qulflaydi:
 *   · chek `draft` da yaratiladi va `send-to-picking` CHAQIRILMAYDI;
 *   · to'lov oynasi DARHOL ochiladi va summa SERVERNIKI;
 *   · savat to'lovgacha TURADI (bekor qilinsa yo'qolmaydi);
 *   · narx siyosati (P12) yangi tugmani ham bloklaydi — aks holda u qulfni
 *     chetlab o'tish yo'li bo'lardi;
 *   · eski «Omborchiga yuborish» yo'li TEGILMAGAN.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { PRODUCT, at, norm, router, salesRoutes } from './harness';

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

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  // Server chek summasini QAYTARADI — to'lov aynan shu raqamdan ketadi.
  vi.mocked(api.post).mockResolvedValue({ id: 'draft-1', sumMinor: '1000000' });
});

describe('P3 — «Sotish» tugmasi yig‘ishni CHETLAB o‘tadi', () => {
  it('faqat chek yaratadi, send-to-picking CHAQIRMAYDI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]).toEqual([
      '/retail-sales',
      {
        sessionId: SESSION_ID,
        positions: [{ productId: 'p-1', quantity: '1', priceMinor: '1000000', discount: '0' }],
      },
    ]);
    // 🔴 Zanjirning butun ma'nosi: yig'ishga UZATILMAYDI.
    const paths = vi.mocked(api.post).mock.calls.map((c) => c[0]);
    expect(paths).not.toContain('/retail-sales/draft-1/send-to-picking');
  });

  it('to‘lov oynasi darhol ochiladi va summa SERVERNIKI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    // Summa server javobidan (`sumMinor: '1000000'`) olinadi, ekranda qayta
    // hisoblangan raqamdan emas: `post()` `expectedSumMinor` ni chek
    // `sumMinor`i bilan qat'iy solishtiradi va farq bo'lsa 409 beradi.
    const dialog = await screen.findByRole('dialog');
    expect(norm(dialog.textContent)).toContain('10 000,00');
  });

  /**
   * Savat ATAYLAB turadi: to'lov oynasini bekor qilgan kassir savatini
   * yo'qotmasligi kerak (yig'ish yo'li savatni darhol tozalaydi, chunki u
   * yerda chek allaqachon omborga ketgan — bu yerda esa hali hech nima
   * yakunlanmagan).
   */
  it('savat to‘lovgacha TURADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    await screen.findByRole('dialog');
    expect(screen.getByTestId('sotuv-cart-line')).toBeInTheDocument();
  });

  it('bo‘sh savatda bloklangan — so‘rov ketmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const btn = await screen.findByTestId('sotuv-sell-direct');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(api.post).not.toHaveBeenCalled();
  });

  /**
   * P12 narx poli qulfi. Yangi tugma eski bilan AYNI shartga bog'langan
   * bo'lishi shart — aks holda «0 so'mga sotish» taqiqi bir tugmada
   * qolib, ikkinchisida ochiq bo'lardi.
   */
  it('narxsiz tovar ikkala tugmani ham bloklaydi (P12 qulfi chetlab o‘tilmaydi)', async () => {
    // Prodda 488 ta tovar aynan shunday — chakana narx qatori umuman yo'q.
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /^\/products\?/,
            value: { items: [PRODUCT({ salePrices: [], buyPrice: null })], total: 1 },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await screen.findByTestId('sotuv-cart-line');

    expect(screen.getByTestId('sotuv-sell-direct')).toBeDisabled();
    expect(screen.getByTestId('sotuv-pay')).toBeDisabled();
    expect(screen.getByTestId('sotuv-price-blocked')).toBeInTheDocument();
  });

  it('eski «Omborchiga yuborish» yo‘li TEGILMAGAN', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('sotuv-pay'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.post).mock.calls[1]).toEqual([
      '/retail-sales/draft-1/send-to-picking',
      {},
    ]);
  });
});
