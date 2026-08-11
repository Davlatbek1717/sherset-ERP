import { CustomerCardPanel } from '@/components/pos/customer-card-panel';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F9 — POS mijoz kartasi.
 *
 * Kassir bir joyda ko'radi: KIM (telefon bo'yicha topiladi), QANCHA QARZI
 * bor (ikki daftar ochiq), NIMA olgan (oxirgi cheklar), qanday ZAKAZlari
 * bor. Tez amallar panelning o'zida emas — ular chaqiruvchiga (POS sahifasi)
 * callback bilan qaytadi, ya'ni panel savat/to'lov mantig'iga TEGMAYDI.
 *
 * 🔴 Bu ekranda qulflanadigan eng muhim shartnoma — **NULL ≠ 0**:
 * `balanceMinor: null` = «o'lchanmagan», va u hech qachon «0 so'm» deb
 * chizilmaydi (xotira: «Ma'lumot sifati bayrog'i qatlami»).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const CP = {
  id: 'cp-1',
  name: 'Alisher',
  phone: '+998901234567',
  description: 'eshik oldida',
  version: 4,
};

const SALE = {
  id: 'sale-1',
  name: 'CHK-00007',
  moment: '2026-08-09T10:00:00.000Z',
  sumMinor: '150000',
  state: 'posted',
};

const ORDER = {
  id: 'ord-1',
  name: 'ZKZ-00003',
  moment: '2026-08-10T10:00:00.000Z',
  sumMinor: '900000',
  state: 'confirmed',
};

interface SummaryOver {
  outstandingMinor?: string;
  balanceMinor?: string | null;
  unregisteredMinor?: string | null;
  registryExceedsBalance?: boolean;
  otherCurrencyBalances?: Array<{ currency: string; balanceMinor: string }>;
}

function routes(summaryOver: SummaryOver = {}, opts: { orders?: unknown[] } = {}) {
  return async (path: string) => {
    if (path.startsWith('/counterparties')) return { items: [CP] };
    if (path.startsWith('/debts/pos/summary')) {
      return {
        counterparty: CP,
        outstandingMinor: '40000',
        openCount: 1,
        oldestAt: '2026-07-01T00:00:00.000Z',
        balanceMinor: '100000',
        unregisteredMinor: '60000',
        registryExceedsBalance: false,
        otherCurrencyBalances: [],
        debts: [],
        ...summaryOver,
      };
    }
    if (path.startsWith('/retail-sales')) return { items: [SALE], total: 1 };
    if (path.startsWith('/customer-orders')) {
      // Server `state=` bo'yicha filtrlaydi — panel har POS holati uchun
      // ALOHIDA so'rov yuboradi. Fixture shuni HALOL modellaydi: zakaz
      // faqat o'z holatidagi so'rovga tushadi (aks holda test bir zakazni
      // uch marta chizib, «duplicate key» ni yashirardi).
      const items = (opts.orders ?? [ORDER]).filter((o) =>
        path.includes(`state=${(o as { state: string }).state}`),
      );
      return { items, total: items.length };
    }
    throw new Error(`kutilmagan so'rov: ${path}`);
  };
}

function renderPanel(over: Partial<Parameters<typeof CustomerCardPanel>[0]> = {}) {
  return renderWithProviders(
    <CustomerCardPanel
      open
      onOpenChange={vi.fn()}
      onPayDebt={vi.fn()}
      onOpenOrder={vi.fn()}
      onReprintReceipt={vi.fn()}
      {...over}
    />,
  );
}

/** Qidiruvdan mijozni tanlaydi. */
async function pick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`customer-card-cp-${CP.id}`));
  await screen.findByTestId('customer-card-debt');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.get).mockImplementation(routes());
  vi.mocked(api.patch).mockResolvedValue({ ...CP, version: 5 });
});

describe('F9 — telefon bo`yicha qidiruv', () => {
  it('yozilgan raqam SERVERGA `search=` bo`lib ketadi', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByTestId('customer-card-search'), '901234567');

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining('/counterparties?search=901234567'),
      );
    });
  });

  it('topilgan mijoz telefoni bilan chiziladi', async () => {
    renderPanel();
    expect(await screen.findByTestId(`customer-card-cp-${CP.id}`)).toHaveTextContent('Alisher');
    expect(await screen.findByTestId(`customer-card-cp-${CP.id}`)).toHaveTextContent(
      '+998901234567',
    );
  });
});

describe('F9 — qarz bloki: ikki daftar', () => {
  it('umumiy qarz (balans) va reyestr qoldig`i AJRATIB ko`rsatiladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    // Balans — mijozning haqiqiy qarzi (100 000 tiyin = 1 000,00 so'm).
    expect(screen.getByTestId('customer-card-balance')).toHaveTextContent(/1\s?000,00/);
    // Reyestr — POS FIFO'si yopa oladigan qism (40 000 tiyin = 400,00 so'm).
    expect(screen.getByTestId('customer-card-registry')).toHaveTextContent(/400,00/);
  });

  it('🔴 reyestrsiz qarz uchun OGOHLANTIRISH chiqadi (POS uni to`lay olmaydi)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.getByTestId('customer-card-unregistered')).toBeInTheDocument();
  });

  it('farq nol bo`lsa ogohlantirish YO`Q', async () => {
    vi.mocked(api.get).mockImplementation(
      routes({ balanceMinor: '40000', unregisteredMinor: '0' }),
    );
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.queryByTestId('customer-card-unregistered')).not.toBeInTheDocument();
  });

  it('🔴 NULL ≠ 0 — o`lchanmagan balans «0» deb chizilmaydi', async () => {
    vi.mocked(api.get).mockImplementation(routes({ balanceMinor: null, unregisteredMinor: null }));
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    const cell = screen.getByTestId('customer-card-balance');
    expect(cell).toHaveTextContent('—');
    expect(cell.textContent ?? '').not.toMatch(/\b0\b/);
    // O'lchanmaganda farq ham chizilmaydi (yolg'on «hammasi reyestrda» degani).
    expect(screen.queryByTestId('customer-card-unregistered')).not.toBeInTheDocument();
  });

  it('boshqa valyutadagi qoldiq ko`rinadi (jimgina yo`qolmaydi)', async () => {
    vi.mocked(api.get).mockImplementation(
      routes({ otherCurrencyBalances: [{ currency: 'USD', balanceMinor: '1500' }] }),
    );
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.getByTestId('customer-card-other-currency')).toHaveTextContent('USD');
  });
});

describe('F9 — tarix va zakazlar', () => {
  it('oxirgi cheklar AYNAN shu mijoz bo`yicha so`raladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining(`/retail-sales?agentId=${CP.id}`),
      );
    });
    expect(await screen.findByTestId(`customer-card-sale-${SALE.id}`)).toHaveTextContent(
      'CHK-00007',
    );
  });

  it('zakazlar AYNAN shu mijoz bo`yicha so`raladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining(`/customer-orders?agentId=${CP.id}`),
      );
    });
    expect(await screen.findByTestId(`customer-card-order-${ORDER.id}`)).toHaveTextContent(
      'ZKZ-00003',
    );
  });
});

describe('F9 — tez amallar', () => {
  it('«Qarz to`lash» tanlangan mijozni chaqiruvchiga qaytaradi', async () => {
    const onPayDebt = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onPayDebt });
    await pick(user);

    await user.click(screen.getByTestId('customer-card-pay-debt'));
    expect(onPayDebt).toHaveBeenCalledWith(expect.objectContaining({ id: CP.id, name: CP.name }));
  });

  it('«Chekni qayta chop etish» chek id`sini qaytaradi', async () => {
    const onReprintReceipt = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onReprintReceipt });
    await pick(user);

    await user.click(await screen.findByTestId(`customer-card-reprint-${SALE.id}`));
    expect(onReprintReceipt).toHaveBeenCalledWith(SALE.id);
  });

  it('«Zakazni ochish» zakaz id`sini qaytaradi', async () => {
    const onOpenOrder = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onOpenOrder });
    await pick(user);

    await user.click(await screen.findByTestId(`customer-card-open-order-${ORDER.id}`));
    expect(onOpenOrder).toHaveBeenCalledWith(ORDER.id);
  });
});

describe('F9 — telefon/izohni tahrirlash', () => {
  it('TOR yo`lga AYNAN {version, phone, description} yuboriladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await user.click(screen.getByTestId('customer-card-edit-open'));
    const phone = await screen.findByTestId('customer-card-edit-phone');
    await user.clear(phone);
    await user.type(phone, '901112233');
    await user.click(screen.getByTestId('customer-card-edit-save'));

    await waitFor(() => {
      expect(vi.mocked(api.patch)).toHaveBeenCalledWith(`/counterparties/${CP.id}/pos-contact`, {
        version: CP.version,
        phone: '901112233',
        description: CP.description,
      });
    });
  });

  it('🔴 umumiy `PATCH /counterparties/:id` ga MUROJAAT QILINMAYDI', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await user.click(screen.getByTestId('customer-card-edit-open'));
    await user.click(screen.getByTestId('customer-card-edit-save'));

    const paths = vi.mocked(api.patch).mock.calls.map((c) => c[0]);
    expect(paths.every((p) => String(p).endsWith('/pos-contact'))).toBe(true);
  });
});
