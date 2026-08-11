/**
 * P12 — savatdagi NARX POLI va 0-NARX himoyasi (egasining qarori 2026-08-11/12).
 *
 * Nima qulflanadi:
 *  🔴 narxsiz tovar savatga tushsa kassir OCHIQ ogohlantirish ko'radi — jim
 *     0 so'mlik qator emas (prodda 488 tovar narxsiz — o'lchangan);
 *  🔴 narxsiz qator bilan chekni yuborib bo'lmaydi (server ham rad etadi);
 *  🔴 chek chegirmasi qator narxini pol ostiga tushirsa — yuborish bloklanadi
 *     (egasining qarori: chegirma jimgina QISILMAYDI, chek to'xtaydi);
 *  🔴 polni buzmaydigan chegirma odatdagidek ishlaydi.
 *
 * Ekran qulfi — himoyaning faqat ko'rinadigan qismi; haqiqiy chegara serverda
 * (`apps/api/.../price-policy-guard.ts`). Ikkalasi `@moysklad/money` dagi bitta
 * funksiyani o'qiydi.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { PRODUCT, PRODUCTS, RETAIL_PRICE_TYPE, at, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
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
});

async function addFirstProduct(user: ReturnType<typeof userEvent.setup>) {
  const tiles = await screen.findAllByTestId('sotuv-product');
  await user.click(at(tiles, 0));
  return await screen.findByTestId('sotuv-cart-line');
}

/** Narxsiz tovar — prodda 488 tasi shunday (chakana narx qatori umuman yo'q). */
function pricelessRoutes() {
  return salesRoutes([
    {
      match: /^\/products\?/,
      value: { items: [PRODUCT({ salePrices: [], buyPrice: null })], total: 1 },
    },
  ]);
}

async function setDiscount(user: ReturnType<typeof userEvent.setup>, percent: string) {
  await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
  await user.type(screen.getByPlaceholderText('0'), percent);
}

describe('SalesScreen — 0-narx himoyasi (P12)', () => {
  it('narxsiz tovar savatga qo‘shilsa kassir OCHIQ ogohlantirish ko‘radi', async () => {
    vi.mocked(api.get).mockImplementation(router(pricelessRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);

    expect(within(line).getByTestId('sotuv-cart-no-price')).toBeInTheDocument();
  });

  it('🔴 narxsiz qator bilan chekni yuborib bo‘lmaydi', async () => {
    vi.mocked(api.get).mockImplementation(router(pricelessRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await addFirstProduct(user);

    expect(screen.getByTestId('sotuv-pay')).toBeDisabled();
    expect(screen.getByTestId('sotuv-price-blocked')).toBeInTheDocument();
  });

  it('narx kiritilgach yuborish ochiladi', async () => {
    vi.mocked(api.get).mockImplementation(router(pricelessRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await user.click(within(line).getByTestId('sotuv-cart-price-edit'));
    const modal = await screen.findByTestId('pos-line-edit');
    await user.click(within(modal).getByTestId('pos-line-edit-price'));
    for (const k of ['5', '0', '0', '0']) {
      await user.click(within(modal).getByRole('button', { name: k }));
    }
    await user.click(within(modal).getByTestId('pos-line-edit-save'));

    expect(screen.getByTestId('sotuv-pay')).not.toBeDisabled();
    expect(screen.queryByTestId('sotuv-price-blocked')).not.toBeInTheDocument();
  });
});

describe('SalesScreen — chek chegirmasi polni buzsa (P12)', () => {
  it('🔴 polni buzadigan chegirmada yuborish BLOKLANADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    // Kartochka: chakana 10 000, tan 6 000 ⇒ pol 6 000. −45% = 5 500 < pol.
    await setDiscount(user, '45');

    expect(screen.getByTestId('sotuv-pay')).toBeDisabled();
    expect(screen.getByTestId('sotuv-price-blocked')).toBeInTheDocument();
  });

  it('polni buzmaydigan chegirma odatdagidek ishlaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    await setDiscount(user, '10'); // 9 000 > pol 6 000

    expect(screen.getByTestId('sotuv-pay')).not.toBeDisabled();
    expect(screen.queryByTestId('sotuv-price-blocked')).not.toBeInTheDocument();
  });

  it('tan narxi YO‘Q tovarda chegirma cheklanmaydi — pol yo‘q (NULL ≠ 0)', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /^\/products\?/,
            value: {
              items: [
                PRODUCT({
                  buyPrice: null,
                  salePrices: [{ priceTypeId: RETAIL_PRICE_TYPE, value: '1000000' }],
                }),
              ],
              total: 1,
            },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    await setDiscount(user, '90');

    expect(screen.getByTestId('sotuv-pay')).not.toBeDisabled();
  });
});

describe('SalesScreen — narx tasmasi POLga nisbatan (P12)', () => {
  it('karta narxi tan narxdan past tovar ZARAR deb belgilanmaydi (46 tovar holati)', async () => {
    // Prod: chakana 3 500 < tan 24 500 ⇒ pol = karta narxi; o'z narxida sotish
    // ruxsat etilgan, ya'ni qizil tasma noto'g'ri signal bo'lardi.
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /^\/products\?/,
            value: {
              items: [
                PRODUCT({
                  buyPrice: '2450000',
                  salePrices: [{ priceTypeId: RETAIL_PRICE_TYPE, value: '350000' }],
                }),
              ],
              total: 1,
            },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);

    expect(line).toHaveAttribute('data-price-band', 'ok');
    expect(screen.getByTestId('sotuv-pay')).not.toBeDisabled();
  });
});

describe('SalesScreen — PRODUCTS fixture sog‘lom', () => {
  it('odatiy savat yuborishga tayyor (regress qo‘riqchisi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    expect(PRODUCTS.items.length).toBeGreaterThan(0);

    await addFirstProduct(user);

    expect(screen.getByTestId('sotuv-pay')).not.toBeDisabled();
  });
});
