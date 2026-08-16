/**
 * TO'LANGAN CHEKNI «TAHRIRLASH» — «Savatga nusxalash» (2026-08-16, egasi).
 *
 * To'langan chekning O'ZI o'zgartirilmaydi (buxgalteriya/ombor buziladi —
 * buning uchun qaytarish bor). «Tahrirlash» = pozitsiyalarni savatga
 * NUSXALASH: kassir o'zgartirib yangi sotuv qiladi yoki sotuvsiz chek
 * chiqaradi. Asl chekka birorta yozuv so'rovi ketmasligi shart.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { RETAIL_PRICE_TYPE, SALE_DETAIL, SALE_ROW, norm, router, salesRoutes } from './harness';

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
  printDebtReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printProformaReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

const LIST_ROW = SALE_ROW({
  state: 'posted',
  sumMinor: '1800000',
  agent: { id: 'cp-1', name: 'Usta Vali' },
});

/** Detal pozitsiyasi ATAYLAB setka tovaridan boshqa nomda — savatga aynan
 *  chekdagi tovar tushganini adashmasdan tekshirish uchun. */
const DETAIL = SALE_DETAIL({
  positions: [
    {
      id: 'pos-9',
      quantity: '2',
      priceMinor: '1000000',
      sumMinor: '1800000',
      discount: '10',
      costMinor: null,
      basePriceMinor: null,
      product: {
        id: 'p-9',
        name: 'Rozetka Legrand',
        code: 'R-002',
        buyPrice: '300000',
        salePrices: [{ priceTypeId: RETAIL_PRICE_TYPE, value: '1000000' }],
      },
    },
  ],
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(
    router(
      salesRoutes([
        { match: /limit=100/, value: { items: [LIST_ROW], total: 1 } },
        { match: /^\/retail-sales\/[^/?]+$/, value: DETAIL },
      ]),
    ),
  );
  window.localStorage.clear();
});

async function openChekDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
  await user.click(await screen.findByRole('button', { name: /Usta Vali/ }));
  return await screen.findByText('CHEK-00001');
}

describe('To‘langan chek — «Savatga nusxalash»', () => {
  it('pozitsiyalar savatga ko‘chadi, rejim Sotuvga qaytadi, asl chekka YOZUV KETMAYDI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    await openChekDetail(user);
    await user.click(screen.getByTestId('chek-copy-to-cart'));

    const line = await screen.findByTestId('sotuv-cart-line');
    expect(norm(line.textContent)).toContain('Rozetka Legrand');
    // Miqdor chekdagidek (2) va narx chekdagi birlik narxi (10 000).
    expect(norm(line.textContent)).toContain('2×10 000');
    // Asl chek o'zgartirilmagan — hech qanday yozuv so'rovi yo'q.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('joriy savat bo‘sh bo‘lmasa — avval avto-qoralamaga olinadi (yo‘qolmaydi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const tiles = await screen.findAllByTestId('sotuv-product');
    const first = tiles[0];
    if (!first) throw new Error('tovar kartasi topilmadi');
    await user.click(first); // savatda «Kabel 2×2.5»

    await openChekDetail(user);
    await user.click(screen.getByTestId('chek-copy-to-cart'));

    // Savatda endi chek tovari, eski savat esa chipda.
    const line = await screen.findByTestId('sotuv-cart-line');
    expect(norm(line.textContent)).toContain('Rozetka Legrand');
    await waitFor(() => expect(screen.getByTestId('sotuv-cart-draft')).toBeInTheDocument());
  });
});
