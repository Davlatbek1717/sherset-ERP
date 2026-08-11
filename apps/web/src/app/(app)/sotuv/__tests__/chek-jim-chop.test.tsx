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

describe('Chek chop etish — printer sozlanmagan shoxi', () => {
  it('qobiqda: brauzer tasdiq-popup‘i OCHILMAYDI, manzilli ogohlantirish chiqadi', async () => {
    vi.mocked(hasNativePrinting).mockReturnValue(true);
    vi.mocked(printReceiptViaAgent).mockResolvedValue({
      handled: false,
      ok: false,
      reason: 'printer-not-set',
    });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await pressPrint(user);

    await waitFor(() => expect(printReceiptViaAgent).toHaveBeenCalledWith('s-1'));
    expect(await screen.findByText(/Chek printeri tanlanmagan/)).toBeInTheDocument();
    // Ogohlantirish kassirga QAYERDA tanlashni ham aytadi.
    expect(screen.getByText(/Omborchilar/)).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('oddiy brauzerda: popup ochiladi (yagona chop yo‘li) — xulq o‘zgarmaydi', async () => {
    vi.mocked(hasNativePrinting).mockReturnValue(false);
    vi.mocked(printReceiptViaAgent).mockResolvedValue({
      handled: false,
      ok: false,
      reason: 'printer-not-set',
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
