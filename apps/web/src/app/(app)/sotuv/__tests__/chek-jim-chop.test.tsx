/**
 * P7 — «chek TASDIQSIZ, avtomatik chiqsin» simiga qo'yilgan qulf.
 *
 * 🔴 Jonli hodisa (egasi, 2026-08-11 monoblok): chek chop etilganda qobiq
 * ichida brauzer sahifasi ochilib TASDIQ so'ralardi. Sabab — chek printeri
 * sozlanmagan (prodda `company_settings` 0 qator ⇒ `receiptPrinterName` NULL),
 * chaqiruvchi esa har qanday `handled:false` ga `?auto=1` popup'ini ochardi;
 * popup qobiq ichida `window.print()` chaqiradi ⇒ Chromium tasdiq oynasi.
 *
 * Endi: qobiqda «printer sozlanmagan» ⇒ popup OCHILMAYDI, kassirga manzilli
 * ogohlantirish chiqadi. Oddiy brauzerda popup — yagona chop yo'li, qoladi.
 *
 * B3 (2026-08-12): chekda «printer sozlanmagan» holati BUTUNLAY yo'qoldi —
 * chek qurilmaning Windows sukut printeriga bosiladi. Qolgan nosozlik sinfi:
 * qobiq chop qildi-yu drayver rad etdi (`handled:true, ok:false`) ⇒ SABABI
 * ko'rsatilgan xato toast'i, popup EMAS.
 */

import { api } from '@/lib/api-client';
import { hasNativePrinting, printReceiptViaAgent } from '@/lib/print-agent';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, SALE_DETAIL, SALE_ROW, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  // P3 — chek panelida qaytarish tugmasi kiosk uchun yashiriladi; sahifa
  // shu yordamchini import qiladi, dublyorda ham bo'lishi shart.
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
  printReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printPickingViaAgent: vi.fn(async () => ({ handled: true, printed: 1, skipped: 0, errors: 0 })),
  printZReportViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  hasNativePrinting: vi.fn(() => false),
  fetchAgentPrinters: vi.fn(async () => []),
}));

const LIST_ROW = SALE_ROW({
  state: 'posted',
  sumMinor: '1800000',
  agent: { id: 'cp-1', name: 'Usta Vali' },
});

function chekRoutes(): Route[] {
  return salesRoutes([
    { match: /limit=100/, value: { items: [LIST_ROW], total: 1 } },
    { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL({}) },
  ]);
}

/** «Cheklar» → birinchi chek → «Chek» tugmasi (chop etish yo'lining kirishi). */
async function pressPrint(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
  await user.click(await screen.findByRole('button', { name: /Usta Vali/ }));
  await screen.findByText('CHEK-00001');
  await user.click(screen.getByRole('button', { name: /Chek$/ }));
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(router(chekRoutes()));
  vi.mocked(printReceiptViaAgent).mockReset();
  vi.mocked(hasNativePrinting).mockReset();
  window.open = vi.fn();
});

describe('Chek chop etish — qobiq shoxi', () => {
  it('qobiqda drayver rad etdi: popup OCHILMAYDI, xato SABABI ko‘rsatiladi', async () => {
    vi.mocked(hasNativePrinting).mockReturnValue(true);
    vi.mocked(printReceiptViaAgent).mockResolvedValue({
      handled: true,
      ok: false,
      error: 'Printer javob bermadi (vaqt tugadi)',
    });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await pressPrint(user);

    await waitFor(() => expect(printReceiptViaAgent).toHaveBeenCalledWith('s-1'));
    expect(await screen.findByText(/Chek chiqmadi/)).toBeInTheDocument();
    // 🔴 Qobiq qaytargan aniq sabab ilgari TASHLAB YUBORILARDI — har nosozlik
    // bir xil umumiy matn berardi va keyingi nosozlik yana taxminga aylanardi.
    expect(screen.getByText(/vaqt tugadi/)).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('oddiy brauzerda: popup ochiladi (yagona chop yo‘li) — xulq o‘zgarmaydi', async () => {
    vi.mocked(hasNativePrinting).mockReturnValue(false);
    vi.mocked(printReceiptViaAgent).mockResolvedValue({
      handled: false,
      ok: false,
      reason: 'load-failed',
    });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await pressPrint(user);

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(vi.mocked(window.open).mock.calls[0]?.[0]).toContain('/print/retail-sale/s-1?auto=1');
  });

  it('qobiqda agent yo‘q / yuklanmadi shoxi popup‘ni SAQLAYDI', async () => {
    vi.mocked(hasNativePrinting).mockReturnValue(true);
    vi.mocked(printReceiptViaAgent).mockResolvedValue({
      handled: false,
      ok: false,
      reason: 'load-failed',
    });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await pressPrint(user);

    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });
});
