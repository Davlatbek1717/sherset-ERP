import { CustomersPanel } from '@/components/pos/customers-panel';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F7/P07 (2026-08-13, egasi) — o'ng paneldagi «Mijozlar» bo'limi.
 *
 * Kassir smena davomida mijoz qarzidan pul qabul qilsa yoki mijoz nimadir
 * qaytarsa — savatga tegmasdan, bitta tab ichida ishlaydi: qidiruv →
 * BITTA HALOL RAQAM (`payableMinor` — server AYNAN shu summagacha qabul
 * qiladi, xotira `pos-customer-card-one-number`) → uch amal (qarz to'lash /
 * mijoz kartasi / cheklari). Panel o'zi HECH QANDAY pul amalini bajarmaydi —
 * hammasi callback orqali mavjud modallarga ketadi (`DebtPaymentDialog`,
 * `CustomerCardPanel`, `ChekDetailPanel` — F6 qaytarish oqimi bilan).
 *
 * Yangi backend YO'Q (reja taqig'i): /counterparties, /debts/pos/summary,
 * /retail-sales?agentId= — hammasi mavjud, kiosk-policy'da ochiq.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CP = { id: 'cp-1', name: 'Usta Vali', phone: '+998901112233' };

/** `GET /debts/pos/summary/:id` — F9 shakli (customer-card bilan bir xil). */
const SUMMARY = {
  counterparty: CP,
  payableMinor: '125000000',
  outstandingMinor: '0',
  openCount: 0,
  oldestAt: null,
  balanceMinor: '125000000',
  registryExceedsBalance: false,
  otherCurrencyBalances: [],
};

const CHEKS = {
  items: [
    {
      id: 's-1',
      name: 'CHEK-00001',
      moment: '2026-08-09T05:30:00.000Z',
      sumMinor: '1800000',
      state: 'posted',
    },
  ],
  total: 1,
};

/** NBSP (formatMoney ming-ajratgichi) bilan birga barcha bo'shliqni yeydi. */
function squash(text: string | null | undefined): string {
  return (text ?? '').replace(/[\s  ]/g, '');
}

function routes(summary: Record<string, unknown> = SUMMARY) {
  return async (path: string) => {
    if (path.startsWith('/counterparties')) return { items: [CP] };
    if (path.startsWith('/debts/pos/summary')) return summary;
    if (path.startsWith('/retail-sales')) return CHEKS;
    throw new Error(`kutilmagan so'rov: ${path}`);
  };
}

function renderPanel() {
  const onOpenCustomerCard = vi.fn();
  const onPayDebt = vi.fn();
  const onOpenChek = vi.fn();
  renderWithProviders(
    <CustomersPanel
      onOpenCustomerCard={onOpenCustomerCard}
      onPayDebt={onPayDebt}
      onOpenChek={onOpenChek}
    />,
  );
  return { onOpenCustomerCard, onPayDebt, onOpenChek };
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByTestId('pos-customers-result'))[0] as HTMLElement);
  await screen.findByTestId('pos-customers-debt');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(routes());
});

describe('CustomersPanel — qidiruv', () => {
  it('natija ro‘yxati nom + telefon bilan chiqadi', async () => {
    renderPanel();

    const rows = await screen.findAllByTestId('pos-customers-result');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Usta Vali');
    expect(rows[0]?.textContent).toContain('+998901112233');
  });

  it('kiritilgan matn so‘rovga `search=` bilan ketadi', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByTestId('pos-customers-search'), 'Vali');
    await waitFor(() => {
      const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.startsWith('/counterparties?') && u.includes('search=Vali'))).toBe(
        true,
      );
    });
  });
});

describe('CustomersPanel — tanlangan mijoz kartochkasi', () => {
  it('summary chaqiriladi va qarz (payableMinor) ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pickCustomer(user);

    expect(api.get).toHaveBeenCalledWith('/debts/pos/summary/cp-1?currency=UZS');
    expect(squash(screen.getByTestId('pos-customers-debt').textContent)).toContain('1250000');
  });

  it('`balanceMinor: null` — «o‘lchanmagan» qatori OCHIQ aytiladi (NULL ≠ 0)', async () => {
    vi.mocked(api.get).mockImplementation(routes({ ...SUMMARY, balanceMinor: null }));
    const user = userEvent.setup();
    renderPanel();
    await pickCustomer(user);

    expect(screen.getByTestId('pos-customers-balance-missing')).toBeInTheDocument();
  });
});

describe('CustomersPanel — uch amal-tugma', () => {
  it('«Qarzni to‘lash» — onPayDebt tanlangan mijoz bilan', async () => {
    const user = userEvent.setup();
    const { onPayDebt } = renderPanel();
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-pay'));
    expect(onPayDebt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cp-1', name: 'Usta Vali' }),
    );
  });

  it('«Mijoz kartasi» — onOpenCustomerCard tanlangan mijoz bilan', async () => {
    const user = userEvent.setup();
    const { onOpenCustomerCard } = renderPanel();
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-card'));
    expect(onOpenCustomerCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cp-1', name: 'Usta Vali' }),
    );
  });

  it('«Cheklari» — so‘rov `agentId=` bilan ketadi, chek bosilsa onOpenChek(saleId)', async () => {
    const user = userEvent.setup();
    const { onOpenChek } = renderPanel();
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-cheks'));
    const chekRow = await screen.findByTestId('pos-customers-chek');
    const urls = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/retail-sales?') && u.includes('agentId=cp-1'))).toBe(
      true,
    );

    await user.click(chekRow);
    expect(onOpenChek).toHaveBeenCalledWith('s-1');
  });

  it('«O‘zgartirish» — qidiruvga qaytadi (oldingi mijoz ma‘lumoti bilan aralashmasin)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pickCustomer(user);

    await user.click(screen.getByTestId('pos-customers-change'));
    expect(await screen.findByTestId('pos-customers-search')).toBeInTheDocument();
    expect(screen.queryByTestId('pos-customers-debt')).toBeNull();
  });
});
