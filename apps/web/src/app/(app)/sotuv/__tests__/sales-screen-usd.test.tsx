import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, SALE_DETAIL, SALE_ROW, router, salesRoutes } from './harness';

/**
 * F5 (MK31) — dollar naqd `/retail-sales/:id/post` payload'iga ULANISHI.
 *
 * Oynaning O'ZI `components/pos/__tests__/rasmilashtirish-usd.test.tsx` da
 * sinalgan; bu yerda faqat SIM tekshiriladi — server sxemasi kutgan ikki
 * maydon (`cashUsdAmountMinor`, `usdRateMinor`) chindan ham yuborilyaptimi.
 * Ular tushib qolsa Zod ularni JIMGINA tashlab, chek «to'lov yetarli emas»
 * bilan 400 olardi (aynan terminal/qarz bilan bo'lgan hodisa).
 */

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
}));

/** «Tayyor» chek — 155 628,37 so'm, aynan $12.50 (kurs 12 450,27) bilan yopiladi. */
function readyRoutes(over: Record<string, unknown> = {}): Route[] {
  const detail = SALE_DETAIL({
    sumMinor: '15562837',
    positions: [
      {
        id: 'pos-1',
        quantity: '1',
        priceMinor: '15562837',
        sumMinor: '15562837',
        discount: '0',
        costMinor: null,
        basePriceMinor: null,
        product: { id: 'p-1', name: 'Kabel 2×2.5', code: 'K-001', buyPrice: '600000' },
      },
    ],
    ...over,
  });
  return salesRoutes([
    {
      match: /^\/retail-sales\?.*state=ready/,
      value: { items: [SALE_ROW({ sumMinor: '15562837' })] },
    },
    { match: /^\/retail-sales\/[^/?]+$/, value: detail },
    { match: /^\/counterparties\?/, value: { items: [] } },
  ]);
}

async function openPaymentModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
  await user.click(await screen.findByRole('button', { name: /To.lov/ }));
  return await screen.findByRole('dialog');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(readyRoutes()));
  vi.mocked(api.post).mockResolvedValue({ id: 's-1' });
});

describe('SalesScreen — dollar to‘lovi post payload‘ida', () => {
  it('dollar berilganda `cashUsdAmountMinor` + `usdRateMinor` yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await user.click(within(dialog).getByTestId('pos-tender-cash-usd'));
    await user.type(within(dialog).getByPlaceholderText('0'), '12.50');
    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/retail-sales/s-1/post', {
      cashAmountMinor: '0',
      cardAmountMinor: '0',
      terminalAmountMinor: '0',
      debtAmountMinor: '0',
      // Sent — so'mga o'girilgan qiymat EMAS (server o'zi o'giradi).
      cashUsdAmountMinor: '1250',
      // Kanonik ×10^8, serverdan olingan satr (sxema `< 10^9` ni rad etadi).
      usdRateMinor: '1245027000000',
      expectedSumMinor: '15562837',
    });
  });

  it('dollarsiz to‘lovda USD maydonlari UMUMAN yuborilmaydi (eski shakl saqlanadi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await user.type(within(dialog).getByPlaceholderText('0'), '155628.37');
    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('cashUsdAmountMinor');
    expect(body).not.toHaveProperty('usdRateMinor');
  });

  it('so‘m + dollar ARALASH to‘lov — ikkala maydon ham ketadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    // 55 628,37 so'm naqd + $8.04 (100 100,17 so'm) = 155 728,54 ⇒ chek yopiladi
    // (qaytim 100,17 so'm — naqd + dollar chegarasi ichida).
    // `fireEvent.change` — belgima-belgi yozish bu testni sekinlashtiradi
    // (yuk ostida 5 s chegarasidan oshib ketardi); maydon boshqariladigan
    // `input`, ya'ni bitta `change` hodisasi aynan shu holatni beradi.
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '55628.37' } });
    await user.click(within(dialog).getByTestId('pos-tender-cash-usd'));
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '8.04' } });
    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(body.cashAmountMinor).toBe('5562837');
    expect(body.cashUsdAmountMinor).toBe('804');
    expect(body.usdRateMinor).toBe('1245027000000');
  });
});
