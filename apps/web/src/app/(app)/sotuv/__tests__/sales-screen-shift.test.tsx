/**
 * MK32 — «Smena» yorlig'i: kassa operatsiyalari, qarz to'lovi oynasi,
 * kassadan chiqim oynasi va smena yopish (kassa TZ §7.2, §8.2–§8.5, §11).
 *
 * **Xulq O'ZGARTIRILMAYDI.** Qulflanayotgan shartnomalar:
 *  · naqd qarz to'lovi shu smenaga bog'lanadi (`retailShiftId`);
 *  · chiqim hujjatida faqat O'Z turiga tegishli maydon yuboriladi;
 *  · sanalmagan dollar `null` bo'lib QOLADI — 0 bilan aralashmaydi;
 *  · izoh maydoni FAQAT farq bo'lganda ko'rinadi.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, norm, router, salesRoutes } from './harness';

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

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const CASH_DESK_ID = '55555555-5555-4555-8555-555555555555';

const DEBT_SUMMARY = {
  counterparty: { id: 'cp-1', name: 'Usta Vali', phone: '+998 90 111 22 33' },
  outstandingMinor: '5000000',
  openCount: 2,
  oldestAt: '2026-07-01T10:00:00.000Z',
  debts: [
    {
      id: 'd-1',
      name: 'QRZ-00001',
      totalMinor: '3000000',
      paidMinor: '0',
      outstandingMinor: '3000000',
      currency: 'UZS',
      orderAt: '2026-07-01T10:00:00.000Z',
    },
    {
      id: 'd-2',
      name: 'QRZ-00002',
      totalMinor: '2000000',
      paidMinor: '0',
      outstandingMinor: '2000000',
      currency: 'UZS',
      orderAt: '2026-07-20T10:00:00.000Z',
    },
  ],
};

function shiftRoutes(over: Route[] = []): Route[] {
  return salesRoutes([
    ...over,
    {
      match: /\/z-report$/,
      value: { expectedCashMinor: '5000000', expectedUsdCashMinor: '0' },
    },
    { match: /^\/expense-items/, value: { items: [{ id: 'ei-1', name: 'Ijara' }] } },
    {
      match: /^\/cashier-sessions\/cash-out-recipients$/,
      value: [{ id: 'r-1', name: 'Direktor' }],
    },
    {
      match: /^\/counterparties\?/,
      value: { items: [{ id: 'cp-1', name: 'Usta Vali', phone: '+998 90 111 22 33' }] },
    },
    { match: /^\/debts\/pos\/summary\//, value: DEBT_SUMMARY },
  ]);
}

const POST_ROUTES: Route[] = [
  { match: /\/drawer-(in|out)$/, value: { ok: true } },
  {
    match: /\/cash-out$/,
    value: { id: 'co-1', name: 'RKO-00001', kind: 'expense', sumMinor: '5000000', auditTypes: [] },
  },
  { match: /^\/debts\/pos\/pay$/, value: { batchId: 'b-1', closedCount: 1, receipt: {} } },
  { match: /\/close$/, value: { ok: true } },
];

/** «Smena» yorlig'iga o'tadi. */
async function openShiftTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Smena/ }));
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(shiftRoutes()));
  vi.mocked(api.post).mockImplementation(router(POST_ROUTES));
  // Chek/PKO chiqarish oynasi — testda ochilmasin.
  window.open = vi.fn();
});

describe('Smena yorlig‘i — ma‘lumot', () => {
  it('kassir, ombor, kassa va smena yig‘indisi ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    expect(screen.getAllByText('Kassir Aliyev').length).toBeGreaterThan(0);
    expect(screen.getByText('Asosiy kassa')).toBeInTheDocument();
    expect(norm(screen.getByText(/3 ta ·/).textContent)).toBe('3 ta · 1 500,00 сум');
    expect(screen.getByRole('link', { name: /Z-hisobot/ })).toHaveAttribute(
      'href',
      `/retail/sessions/${SESSION_ID}`,
    );
  });
});

describe('Smena yorlig‘i — kassa kirim/chiqim', () => {
  it('«Kirim» maydonlarni ochadi; summa 0 ekan tasdiq BLOKLANGAN', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    expect(screen.queryByPlaceholderText(/Summa \(so.m\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Kirim$/ }));
    expect(screen.getByPlaceholderText(/Summa \(so.m\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kirim tasdiqlash' })).toBeDisabled();
  });

  it('kirim summasi va izohi bilan yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: /Kirim$/ }));
    await user.type(screen.getByPlaceholderText(/Summa \(so.m\)/), '50000');
    await user.type(screen.getByPlaceholderText(/Izoh/), 'Boshlang‘ich pul');
    await user.click(screen.getByRole('button', { name: 'Kirim tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/drawer-in`, {
      sumMinor: '5000000',
      description: 'Boshlang‘ich pul',
    });
  });

  it('chiqim — izohsiz `description: undefined` bilan ketadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: /Chiqim$/ }));
    await user.type(screen.getByPlaceholderText(/Summa \(so.m\)/), '20000');
    await user.click(screen.getByRole('button', { name: 'Chiqim tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/drawer-out`, {
      sumMinor: '2000000',
      description: undefined,
    });
  });

  it('ochiq turgan tugmani qayta bosish maydonlarni yopadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: /Kirim$/ }));
    await user.click(screen.getByRole('button', { name: /Kirim$/ }));
    expect(screen.queryByPlaceholderText(/Summa \(so.m\)/)).not.toBeInTheDocument();
  });
});

describe('Qarz to‘lovi oynasi (kassa TZ §7.2)', () => {
  it('mijoz tanlangach qoldiq ko‘rinadi va «Hammasi» summani to‘ldiradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-debt-pay-open'));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByTestId('debt-pay-cp-cp-1'));

    expect(norm((await within(dialog).findByTestId('debt-pay-outstanding')).textContent)).toBe(
      '50 000,00 сум',
    );
    expect(norm(dialog.textContent)).toContain('2 ta qarz');

    await user.click(within(dialog).getByRole('button', { name: /Hammasi/ }));
    expect(norm(within(dialog).getByTestId('debt-pay-amount').textContent)).toBe('50 000,00 сум');
  });

  it('to‘lov shu SMENAGA va kassaga bog‘lanib yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-debt-pay-open'));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByTestId('debt-pay-cp-cp-1'));
    await user.click(await within(dialog).findByRole('button', { name: /Hammasi/ }));
    await user.click(within(dialog).getByTestId('debt-pay-confirm'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/debts/pos/pay', {
      counterpartyId: 'cp-1',
      amountMinor: '5000000',
      method: 'cash',
      cashDeskId: CASH_DESK_ID,
      retailShiftId: SESSION_ID,
    });
  });

  it('qarzdan ORTIQ summa — ogohlantirish va tasdiq bloklanadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-debt-pay-open'));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByTestId('debt-pay-cp-cp-1'));
    await user.click(await within(dialog).findByRole('button', { name: /Hammasi/ }));
    // 50 000 → 500 000: qarzdan 10 barobar ko'p.
    await user.click(within(dialog).getByRole('button', { name: '0' }));

    expect(within(dialog).getByText(/ko.p\. Qaytimni kassadan bering/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('debt-pay-confirm')).toBeDisabled();
  });
});

describe('Kassadan chiqim oynasi (kassa TZ §8.2/§8.3)', () => {
  /** Numpad orqali summa teradi. */
  async function numpad(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    digits: string,
  ) {
    for (const d of digits) {
      await user.click(within(dialog).getByRole('button', { name: d }));
    }
  }

  it('modda tanlanmaguncha tasdiq BLOKLANGAN', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-cash-out-open'));
    const dialog = await screen.findByRole('dialog');
    await numpad(user, dialog, '50000');

    expect(norm(within(dialog).getByTestId('cash-out-amount').textContent)).toBe('50 000,00 сум');
    expect(within(dialog).getByTestId('cash-out-confirm')).toBeDisabled();
  });

  it('xarajat — faqat `expenseItemId` yuboriladi, `recipientId` null', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-cash-out-open'));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByTestId('cash-out-pick-ei-1'));
    await numpad(user, dialog, '50000');
    await user.click(within(dialog).getByTestId('cash-out-confirm'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/cash-out`, {
      kind: 'expense',
      sumMinor: '5000000',
      expenseItemId: 'ei-1',
      recipientId: null,
      description: null,
    });
  });

  it('inkassatsiya — ro‘yxat qabul qiluvchilarga almashadi va `recipientId` ketadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByTestId('pos-cash-out-open'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByTestId('cash-out-kind-collection'));
    await user.click(await within(dialog).findByTestId('cash-out-pick-r-1'));
    await numpad(user, dialog, '50000');
    await user.click(within(dialog).getByTestId('cash-out-confirm'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/cash-out`, {
      kind: 'collection',
      sumMinor: '5000000',
      expenseItemId: null,
      recipientId: 'r-1',
      description: null,
    });
  });
});

describe('Smena yopish (kassa TZ §8.4/§8.5)', () => {
  it('kutilgan naqd TASDIQLASHDAN OLDIN ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    expect(norm((await screen.findByText('Kutilgan naqd')).parentElement?.textContent)).toBe(
      'Kutilgan naqd50 000,00 сум',
    );
  });

  it('sanoq kam bo‘lsa — «Kamomad» va izoh maydoni CHIQADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    await screen.findByText('Kutilgan naqd');
    await user.type(screen.getByPlaceholderText(/Kassadagi naqd pul/), '45000');

    expect(norm(screen.getByTestId('close-variance').textContent)).toBe('Kamomad-5 000,00 сум');
    expect(screen.getByTestId('close-variance-note')).toBeInTheDocument();
  });

  it('farq yo‘q — izoh maydoni ko‘rsatilmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    await screen.findByText('Kutilgan naqd');
    await user.type(screen.getByPlaceholderText(/Kassadagi naqd pul/), '50000');

    expect(norm(screen.getByTestId('close-variance').textContent)).toBe("Farq yo'q0");
    expect(screen.queryByTestId('close-variance-note')).not.toBeInTheDocument();
  });

  it('dollar oqimi YO‘Q smenada dollar maydoni chizilmaydi va so‘rovda ham yo‘q', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    await screen.findByText('Kutilgan naqd');
    expect(screen.queryByTestId('close-cash-usd')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Kassadagi naqd pul/), '50000');
    await user.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/close`, {
      closingCashMinor: '5000000',
      varianceNote: null,
    });
  });

  it('dollar oqimi BOR — maydon chiqadi; sanalmasa `closingCashUsdMinor` YUBORILMAYDI', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        shiftRoutes([
          {
            match: /\/z-report$/,
            value: { expectedCashMinor: '5000000', expectedUsdCashMinor: '10000' },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    expect(await screen.findByTestId('close-cash-usd')).toBeInTheDocument();
    expect(screen.getByText('Kutilgan dollar').parentElement?.textContent).toContain('$100.00');

    await user.type(screen.getByPlaceholderText(/Kassadagi naqd pul/), '50000');
    await user.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    // Sanalmagan dollar `0` EMAS — kalitning O'ZI yuborilmaydi.
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/close`, {
      closingCashMinor: '5000000',
      varianceNote: null,
    });
  });

  it('sanalgan dollar farqi SENTDA ko‘rsatiladi va so‘rovga tushadi', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        shiftRoutes([
          {
            match: /\/z-report$/,
            value: { expectedCashMinor: '5000000', expectedUsdCashMinor: '10000' },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openShiftTab(user);

    await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
    await user.type(await screen.findByTestId('close-cash-usd'), '90');
    await user.type(screen.getByPlaceholderText(/Kassadagi naqd pul/), '50000');

    // K-2 TUZATILDI (audit-fixlar): minus endi `$` dan OLDIN («-$10.00») —
    // so'm qatoridagi «-5 000,00 сум» bilan bir xil o'qiladi.
    expect(norm(screen.getByTestId('close-variance-usd').textContent)).toBe('Kamomad-$10.00');
    // Dollar farqi ham izoh maydonini ochadi.
    await user.type(screen.getByTestId('close-variance-note'), '10$ yo‘qoldi');
    await user.click(screen.getByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/cashier-sessions/${SESSION_ID}/close`, {
      closingCashMinor: '5000000',
      closingCashUsdMinor: '9000',
      varianceNote: '10$ yo‘qoldi',
    });
  });
});
