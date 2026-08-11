import { DebtPaymentDialog } from '@/components/pos/debt-payment-dialog';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P1 (2026-08-11) — POS «Qarz to'lovi» oynasi BALANS bo'yicha ishlaydi.
 *
 * TUZATISHDAN OLDINGI holat: oyna `outstandingMinor` (FAQAT `Debt` reyestri)
 * ga qarardi. Prodda reyestr 0 qator, qarz esa balansda ⇒ ekran «Qarz yo'q»
 * deb yozardi va TASDIQLASH TUGMASI UMUMAN RENDER BO'LMASDI — mijoz pul
 * olib kelsa qabul qilishning yo'li yo'q edi.
 *
 * Shartnoma: ekran serverning `payableMinor` sonini ko'rsatadi va ortiqcha
 * to'lov chegarasini ham AYNAN shundan oladi (server `debtPayable` bilan bir
 * formula — ikki manba bo'lmasin).
 *
 * NON-VACUOUS: `payableMinor`gacha bo'lgan ekranda 1-, 2- va 3-testlar
 * yiqiladi (qoldiq bloki umuman chizilmaydi).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CP = { id: 'cp-1', name: 'Madaniyat Shurik', phone: '+998901234567' };
const SESSION = '44444444-4444-4444-4444-444444444444';

/** Prod holati: reyestr BO'SH, balansda 4 617 050 so'm. */
function routes(summary: Record<string, unknown>) {
  return async (path: string) => {
    if (path.startsWith('/exchange-rates/rate')) throw new Error('kurs yo`q');
    if (path.startsWith('/counterparties')) return { items: [CP] };
    if (path.startsWith('/debts/pos/summary')) return { counterparty: CP, ...summary };
    throw new Error(`kutilmagan so'rov: ${path}`);
  };
}

const REGISTRY_EMPTY = {
  payableMinor: '461705000',
  adoptableMinor: '461705000',
  outstandingMinor: '0',
  openCount: 0,
  oldestAt: null,
  balanceMinor: '461705000',
  unregisteredMinor: '461705000',
  debts: [],
};

function openDialog() {
  renderWithProviders(
    <DebtPaymentDialog open onOpenChange={vi.fn()} sessionId={SESSION} cashDeskId="desk-1" />,
  );
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`debt-pay-cp-${CP.id}`));
}

async function typeAmount(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: d }));
  }
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.post).mockResolvedValue({
    batchId: 'b1',
    receipt: {
      batchId: 'b1',
      paidMinor: '100000',
      currency: 'UZS',
      originalMinor: null,
      exchangeRate: null,
      method: 'cash',
      lines: [],
      outstandingAfterMinor: '461605000',
    },
    closedCount: 1,
  });
});

describe("P1 — reyestr bo'sh, qarz balansda", () => {
  it("«qarz yo'q» O'RNIGA balansdagi to'lanadigan qarz ko'rsatiladi", async () => {
    vi.mocked(api.get).mockImplementation(routes(REGISTRY_EMPTY));
    const user = userEvent.setup();
    openDialog();

    await pickCustomer(user);

    const box = await screen.findByTestId('debt-pay-outstanding');
    expect(box.textContent?.replace(/\s| /g, '')).toContain('4617050');
  });

  it("to'lovni yuborish MUMKIN (tugma bloklanmaydi)", async () => {
    vi.mocked(api.get).mockImplementation(routes(REGISTRY_EMPTY));
    const user = userEvent.setup();
    openDialog();

    await pickCustomer(user);
    await screen.findByTestId('debt-pay-outstanding');
    await typeAmount(user, '1000'); // 1 000 so'm — jonli sinov summasi

    const confirm = screen.getByTestId('debt-pay-confirm');
    expect(confirm).not.toBeDisabled();

    await user.click(confirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      counterpartyId: CP.id,
      amountMinor: '100000',
      currency: 'UZS',
      method: 'cash',
      retailShiftId: SESSION,
    });
  });

  it("ortiqcha to'lov chegarasi BALANSDAN olinadi (reyestrdan emas)", async () => {
    vi.mocked(api.get).mockImplementation(
      routes({ ...REGISTRY_EMPTY, payableMinor: '100000', adoptableMinor: '100000' }),
    );
    const user = userEvent.setup();
    openDialog();

    await pickCustomer(user);
    await screen.findByTestId('debt-pay-outstanding');
    await typeAmount(user, '2000'); // 2 000 so'm > 1 000 so'mlik qarz

    expect(screen.getByTestId('debt-pay-confirm')).toBeDisabled();
  });

  it("haqiqatan qarzi YO'Q mijozda «qarz yo'q» holati saqlanadi", async () => {
    vi.mocked(api.get).mockImplementation(
      routes({
        payableMinor: '0',
        adoptableMinor: '0',
        outstandingMinor: '0',
        openCount: 0,
        oldestAt: null,
        balanceMinor: '0',
        unregisteredMinor: '0',
        debts: [],
      }),
    );
    const user = userEvent.setup();
    openDialog();

    await pickCustomer(user);

    expect(await screen.findByText(/Qarz yo|Долгов нет/i)).toBeInTheDocument();
    expect(screen.queryByTestId('debt-pay-confirm')).toBeNull();
  });
});
