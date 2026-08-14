import { CustomerCardPanel } from '@/components/pos/customer-card-panel';
import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F9 — POS mijoz kartasi · **P2 (2026-08-12) da qayta yozilgan shartnoma**.
 *
 * Kassir bir joyda ko'radi: KIM (telefon bo'yicha topiladi), QANCHA QARZI
 * bor, NIMA olgan (oxirgi cheklar), qanday ZAKAZlari bor. Tez amallar
 * panelning o'zida emas — ular chaqiruvchiga (POS sahifasi) callback bilan
 * qaytadi, ya'ni panel savat/to'lov mantig'iga TEGMAYDI.
 *
 * 🔴 P2 — **BITTA HALOL RAQAM.** Ilgari kartada IKKI katta son yonma-yon
 * turardi («Umumiy qarz» = balans va «Reyestrda» = `Debt` reyestri) — mijoz
 * ham, kassir ham qaysi biriga ishonishni bilmasdi. P1 dan keyin POS balansni
 * ham to'lay oladi, ya'ni yagona mazmunli son — **`payableMinor`**: server
 * AYNAN shu summagacha qabul qiladi (bir formula: `debtPayable`). Ikki
 * daftarning farqi endi ogohlantirish emas — u ASOSIY RAQAM ICHIDA.
 *
 * 🔴 Ikkinchi shartnoma — **NULL ≠ 0 yashirilmaydi**: balans qatori yo'q
 * bo'lsa (`balanceMinor: null`) ekran buni OCHIQ aytadi
 * (`customer-card-balance-missing`), chunki «0 so'm» ko'rgan kassir mijozda
 * qarz yo'q deb o'ylardi (xotira: «Ma'lumot sifati bayrog'i qatlami»).
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
  payableMinor?: string;
  adoptableMinor?: string;
  outstandingMinor?: string;
  balanceMinor?: string | null;
  unregisteredMinor?: string | null;
  registryExceedsBalance?: boolean;
  otherCurrencyBalances?: Array<{ currency: string; balanceMinor: string }>;
}

interface HistoryOver {
  openingMinor?: string | null;
  totalCount?: number;
  hasMore?: boolean;
  entries?: Array<{
    at: string;
    docType: string;
    docId: string | null;
    number: string | null;
    deltaMinor: string;
    increase: boolean;
  }>;
}

const HISTORY_ENTRY = {
  at: '2026-08-09T10:00:00.000Z',
  docType: 'retailsale',
  docId: 'rs-1',
  number: 'CHK-00007',
  deltaMinor: '100000',
  increase: true,
};

function routes(
  summaryOver: SummaryOver = {},
  opts: { orders?: unknown[]; history?: HistoryOver } = {},
) {
  return async (path: string) => {
    if (path.startsWith('/counterparties')) return { items: [CP] };
    if (path.startsWith('/debts/pos/history')) {
      return {
        counterparty: CP,
        currency: 'UZS',
        openingMinor: '5000000',
        totalCount: 1,
        hasMore: false,
        entries: [HISTORY_ENTRY],
        ...(opts.history ?? {}),
      };
    }
    if (path.startsWith('/debts/pos/summary')) {
      return {
        counterparty: CP,
        // P1 shartnomasi: `payableMinor` = max(reyestr, balans) — POS AYNAN
        // shu summagacha qabul qiladi.
        payableMinor: '100000',
        adoptableMinor: '60000',
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

describe('P2 — qarz bloki: BITTA halol raqam', () => {
  it('asosiy son = `payableMinor` (server qabul qiladigan summa)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    // 100 000 tiyin = 1 000,00 so'm — balans va reyestrdan KATTAsi.
    expect(screen.getByTestId('customer-card-payable')).toHaveTextContent(/1\s?000,00/);
  });

  it('🔴 IKKI raqobatchi katta son BOSHQA ko`rsatilmaydi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.queryByTestId('customer-card-balance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('customer-card-registry')).not.toBeInTheDocument();
    // «Reyestrdan tashqarida» ogohlantirishi ham yo'q: u endi asosiy raqam
    // ICHIDA (P1 dan keyin kassada to'lash mumkin — ogohlantirish yolg'on).
    expect(screen.queryByTestId('customer-card-unregistered')).not.toBeInTheDocument();
  });

  it('🔴 NULL ≠ 0 — balans qatori yo`qligi OCHIQ aytiladi', async () => {
    vi.mocked(api.get).mockImplementation(
      routes({ payableMinor: '40000', balanceMinor: null, unregisteredMinor: null }),
    );
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    // Reyestrdagi qarz o'lchangan — u ko'rsatiladi.
    expect(screen.getByTestId('customer-card-payable')).toHaveTextContent(/400,00/);
    // Lekin balans qatori yo'qligi YASHIRILMAYDI.
    expect(screen.getByTestId('customer-card-balance-missing')).toBeInTheDocument();
  });

  it('balans o`lchangan bo`lsa «qator yo`q» izohi CHIQMAYDI', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.queryByTestId('customer-card-balance-missing')).not.toBeInTheDocument();
  });

  it('🔴 teskari nomuvofiqlik (reyestr > balans) ogohlantirishi QOLADI', async () => {
    vi.mocked(api.get).mockImplementation(routes({ registryExceedsBalance: true }));
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(screen.getByTestId('customer-card-registry-exceeds')).toBeInTheDocument();
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

describe('P2 — qarz TARIXI (balans jurnalidan)', () => {
  it('tarix AYNAN shu mijoz va kassa valyutasi bo`yicha so`raladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        expect.stringContaining(`/debts/pos/history/${CP.id}?currency=UZS`),
      );
    });
  });

  it('harakat qatori hujjat raqami va summasi bilan chiziladi', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    const row = await screen.findByTestId('customer-card-history-rs-1');
    expect(row).toHaveTextContent('CHK-00007');
    expect(row).toHaveTextContent(/1\s?000,00/);
  });

  it('🔴 boshlang`ich qoldiq ALOHIDA qator (bugungi «harakat» emas)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(await screen.findByTestId('customer-card-history-opening')).toHaveTextContent(
      /50\s?000,00/,
    );
  });

  it('🔴 `openingMinor: null` — boshlang`ich qoldiq qatori CHIZILMAYDI', async () => {
    vi.mocked(api.get).mockImplementation(routes({}, { history: { openingMinor: null } }));
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    await screen.findByTestId('customer-card-history');
    expect(screen.queryByTestId('customer-card-history-opening')).not.toBeInTheDocument();
  });

  it('tarix bo`sh bo`lsa buni AYTADI (jim bo`shliq emas)', async () => {
    vi.mocked(api.get).mockImplementation(
      routes({}, { history: { entries: [], openingMinor: null, totalCount: 0 } }),
    );
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(await screen.findByTestId('customer-card-history-empty')).toBeInTheDocument();
  });

  it('kesilgan tarixda «yana bor» belgisi chiqadi', async () => {
    vi.mocked(api.get).mockImplementation(
      routes({}, { history: { hasMore: true, totalCount: 120 } }),
    );
    const user = userEvent.setup();
    renderPanel();
    await pick(user);

    expect(await screen.findByTestId('customer-card-history-more')).toBeInTheDocument();
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

describe('F7-tuzatish (2026-08-14) — `initialAgent` bilan ochilish', () => {
  // F7 hisobotidagi ochiq kamchilik: Mijozlar panelidan «Mijoz kartasi»
  // bosilganda karta QIDIRUV qadamidan ochilardi — mijoz allaqachon tanlangan
  // edi. `DebtPaymentDialog` bilan bir naqsh: `initialAgent` berilsa qidiruv
  // o'tkazib yuboriladi.
  it('initialAgent berilsa qidiruv qadamisiz kartochka ochiladi', async () => {
    renderPanel({ initialAgent: CP });

    expect(await screen.findByTestId('customer-card-debt')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-card-search')).toBeNull();
    expect(screen.getByText('Alisher')).toBeInTheDocument();
  });

  it('initialAgent YO`Q bo`lsa avvalgidek qidiruvdan boshlanadi', async () => {
    renderPanel();
    expect(await screen.findByTestId('customer-card-search')).toBeInTheDocument();
  });
});
