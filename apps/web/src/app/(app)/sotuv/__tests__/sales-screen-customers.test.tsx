/**
 * F7/P07 (2026-08-13, egasi) — o'ng panelda «Mijozlar» tabi: sahifa-darajali
 * wiring. Komponent ichi `customers-panel.test.tsx` da; bu yerda faqat
 * sahifaga ULANISH:
 *
 * 1) tab AYNAN «Cheklar» va «Smena» ORASIDA (egasining so'zi bilan);
 * 2) tab ochilsa mijoz qidiruvi ko'rinadi;
 * 3) «Qarzni to'lash» mavjud `DebtPaymentDialog`ni TANLangan mijoz bilan
 *    ochadi (qidiruv qadami o'tkazib yuboriladi — `initialAgent` oqimi);
 * 4) mijoz cheki bosilsa mavjud `ChekDetailPanel` ochiladi (u yerdan F6
 *    qaytarish oqimi ishlaydi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { SALE_DETAIL, SALE_ROW, router, salesRoutes } from './harness';

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

const CP = { id: 'cp-1', name: 'Usta Vali', phone: '+998901112233' };

/** `DebtPaymentDialog` ham shu summary'ni o'qiydi — to'liq shakl kerak. */
const SUMMARY = {
  counterparty: CP,
  payableMinor: '125000000',
  adoptableMinor: '125000000',
  outstandingMinor: '0',
  openCount: 0,
  oldestAt: null,
  balanceMinor: '125000000',
  unregisteredMinor: '125000000',
  registryExceedsBalance: false,
  otherCurrencyBalances: [],
  debts: [],
};

function customersRoutes() {
  return salesRoutes([
    { match: /^\/counterparties\?/, value: { items: [CP] } },
    { match: /^\/debts\/pos\/summary\//, value: SUMMARY },
    {
      match: /agentId=/,
      value: { items: [SALE_ROW({ state: 'posted', agent: CP })], total: 1 },
    },
    { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL() },
  ]);
}

/** «Mijozlar» tabini ochib, yagona natijadan mijozni tanlaydi. */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Mijozlar' }));
  await user.click((await screen.findAllByTestId('pos-customers-result'))[0] as HTMLElement);
  await screen.findByTestId('pos-customers-debt');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(router(customersRoutes()));
});

describe('«Mijozlar» tabi — joylashuv', () => {
  it('tab bar’da Cheklar va Smena ORASIDA turadi', async () => {
    renderWithProviders(<SotuvPage />);

    const tab = await screen.findByRole('button', { name: 'Mijozlar' });
    expect(tab.previousElementSibling?.textContent).toMatch(/Cheklar/);
    expect(tab.nextElementSibling?.textContent).toMatch(/Smena/);
  });

  it('tab ochilsa mijoz qidiruvi ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: 'Mijozlar' }));
    expect(await screen.findByTestId('pos-customers-search')).toBeInTheDocument();
  });
});

describe('«Mijozlar» tabi — mavjud modallarga ulanish', () => {
  it('«Qarzni to‘lash» — DebtPaymentDialog TANLANGAN mijoz bilan ochiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-pay'));
    // `initialAgent` oqimi: qidiruv qadamisiz to'g'ri mijozning qarz oynasi.
    expect(await screen.findByTestId('debt-pay-outstanding')).toBeInTheDocument();
    expect(screen.queryByTestId(`debt-pay-cp-${CP.id}`)).toBeNull();
  });

  it('mijoz cheki bosilsa ChekDetailPanel ochiladi (F6 qaytarish shu yerda)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-cheks'));
    await user.click(await screen.findByTestId('pos-customers-chek'));

    // Detal sarlavhasi + F6 qaytarish tugmasi — mavjud panel, qayta yozilmagan.
    expect(await screen.findByText('CHEK-00001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↩ Qaytarish' })).toBeInTheDocument();
  });
});
