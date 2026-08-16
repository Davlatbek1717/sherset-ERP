/**
 * ❌ NOTO'G'RI KIRITILGAN CHEKNI BEKOR QILISH (egasi, 2026-08-16).
 *
 * 🔴 JONLI MUAMMO: kassa «Cheklar» ro'yxatida `draft` («Qoralama») chek
 * qolib ketsa, uni olib tashlashning HECH QANDAY yo'li yo'q edi — panelda
 * faqat chop, savatga nusxalash va `posted` uchun qaytarish bor edi. Egasi
 * ikki xato chekni ko'rsatib «olib tashla» dedi.
 *
 * QULFLANADIGAN SHARTNOMA — ikki tomonlama:
 *   1. to'lanmagan chekda (`draft|picking|ready`) tugma BOR va u
 *      `POST /retail-sales/:id/cancel` chaqiradi;
 *   2. 🔴 TO'LANGAN chekda tugma YO'Q — pul harakati bo'lgan hujjat bu yo'l
 *      bilan yo'qolmasligi kerak (yagona to'g'ri yo'l — QAYTARISH). Bu
 *      ikkinchi shart birinchisidan MUHIMROQ: uni buzish kassa hisobotini
 *      jimgina buzardi.
 *
 * Bekor qilish O'CHIRISH emas — server hujjatni `cancelled` ga o'tkazadi,
 * rezervni bo'shatadi va omborchi topshiriqlarini yopadi (audit izi qoladi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, SALE_DETAIL, SALE_ROW, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  isKioskUser: () => true,
  useAuth: () => ({
    user: { id: 'u-1', name: 'Kassir Ravshan' },
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

const LIST_ROW = SALE_ROW({
  state: 'draft',
  sumMinor: '3100000',
  agent: { id: 'cp-1', name: 'Usta Vali' },
});

function routes(state: string): Route[] {
  return salesRoutes([
    { match: /limit=100/, value: { items: [LIST_ROW], total: 1 } },
    { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL({ state, sumMinor: '3100000' }) },
  ]);
}

async function openChek(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
  await user.click(await screen.findByRole('button', { name: /Usta Vali/ }));
  await screen.findByText('CHEK-00001');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.post).mockResolvedValue({ ok: true });
  window.open = vi.fn();
});

describe('Chekni bekor qilish — to`lanmagan holatlar', () => {
  it.each(['draft', 'picking', 'ready'])('%s: tugma BOR', async (state) => {
    vi.mocked(api.get).mockImplementation(router(routes(state)));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await openChek(user);

    expect(screen.getByTestId('chek-cancel')).toBeInTheDocument();
  });

  it('bosilganda TASDIQ so`raladi va serverga `cancel` ketadi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('draft')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openChek(user);

    await user.click(screen.getByTestId('chek-cancel'));

    // Tasdiq oynasi — tugma matni `cancel_sale_confirm_label` («Chekni bekor
    // qilish»). Sarlavhada chek raqami VA summasi bo'ladi, lekin uni matn
    // bo'yicha izlab bo'lmaydi: o'sha raqam panelda ham turibdi (ikki mos).
    const confirmBtn = await screen.findByRole('button', { name: /Chekni bekor qilish/ });
    expect(api.post).not.toHaveBeenCalled(); // hali tasdiqlanmadi

    await user.click(confirmBtn);

    await waitFor(() =>
      expect(vi.mocked(api.post).mock.calls.some((c) => String(c[0]).endsWith('/cancel'))).toBe(
        true,
      ),
    );
  });
});

describe('🔴 To`langan chek bu yo`l bilan YO`QOLMAYDI', () => {
  it('posted: bekor qilish tugmasi YO`Q (faqat qaytarish)', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('posted')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await openChek(user);

    expect(screen.queryByTestId('chek-cancel')).toBeNull();
    // Qaytarish esa O'Z joyida qoladi.
    expect(screen.getByRole('button', { name: /Qaytarish/ })).toBeInTheDocument();
  });

  it.each(['cancelled', 'refunded'])(
    '%s: tugma YO`Q (ikkinchi marta bekor bo`lmaydi)',
    async (state) => {
      vi.mocked(api.get).mockImplementation(router(routes(state)));
      const user = userEvent.setup();
      renderWithProviders(<SotuvPage />);

      await openChek(user);

      expect(screen.queryByTestId('chek-cancel')).toBeNull();
    },
  );
});
