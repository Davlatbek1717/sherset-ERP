/**
 * F7 — POS «Zakazlar» yorlig'i: ro'yxat · detal · `draft → confirmed`.
 *
 * Qulflanadigan shartnomalar:
 *  · ro'yxat SERVER filtri bilan so'raladi (`state` + `storeId`) — kassir
 *    boshqa do'konning zakazini ko'rmaydi va holatni FE saralamaydi;
 *  · tasdiqlash AYNAN `POST /customer-orders/:id/transitions/confirmed` —
 *    kiosk allowlist'da ochilgan yagona yozuv yo'li (`cancelled`/`paid` emas);
 *  · `approve` ruxsati yo'q kassir tugmani KO'RMAYDI (server ham rad etadi —
 *    `@RequirePermission({ customerorder, approve })`);
 *  · `customerorder.view` NO bo'lsa yorliqning O'ZI chizilmaydi.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
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
  hasNativePrinting: vi.fn(() => false),
  fetchAgentPrinters: vi.fn(async () => []),
  printReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printPickingViaAgent: vi.fn(async () => ({ handled: true, printed: 1, skipped: 0, errors: 0 })),
  printZReportViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

/** `SESSION().store.id` — ro'yxat so'roviga aynan shu ketishi kerak. */
const STORE_ID = '66666666-6666-4666-8666-666666666666';

function ORDER_ROW(over: Record<string, unknown> = {}) {
  return {
    id: 'co-1',
    name: 'ZKZ-00001',
    moment: '2026-08-10T09:00:00.000Z',
    sumMinor: '4500000',
    state: 'draft',
    agent: { id: 'cp-1', name: 'Usta Vali' },
    store: { id: STORE_ID, name: 'Markaziy do‘kon' },
    ...over,
  };
}

function ORDER_DETAIL(over: Record<string, unknown> = {}) {
  return {
    ...ORDER_ROW(),
    positions: [
      {
        id: 'cop-1',
        quantity: '3',
        reservedQty: '0',
        priceMinor: '1000000',
        discount: '0',
        product: { id: 'p-9', name: 'Avtomat IEK 16A', code: 'A-016', uom: 'dona' },
      },
      {
        id: 'cop-2',
        quantity: '2',
        reservedQty: '0',
        priceMinor: '750000',
        discount: '0',
        product: { id: 'p-8', name: 'Gofra truba 20mm', code: 'G-020', uom: 'm' },
      },
    ],
    ...over,
  };
}

const FULL_MATRIX = { matrix: { customerorder: { view: 'ALL', approve: 'ALL' } } };

function orderRoutes(over: Route[] = []): Route[] {
  return salesRoutes([
    ...over,
    { match: /^\/customer-orders\/co-1$/, value: ORDER_DETAIL() },
    { match: /^\/customer-orders\?/, value: { items: [ORDER_ROW()], total: 1 } },
  ]);
}

const POST_ROUTES: Route[] = [
  {
    match: /^\/customer-orders\/co-1\/transitions\/confirmed$/,
    value: ORDER_ROW({ state: 'confirmed' }),
  },
];

/** «Zakazlar» yorlig'iga o'tadi. */
async function openOrdersTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Zakazlar/ }));
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(orderRoutes()));
  vi.mocked(api.post).mockImplementation(router(POST_ROUTES));
  window.open = vi.fn();
});

describe('F7 — «Zakazlar» ro‘yxati', () => {
  it('yorliq ochilganda `state=draft` + `storeId` bilan so‘raladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);

    await waitFor(() => expect(screen.getByText('ZKZ-00001')).toBeInTheDocument());

    const paths = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    const listCall = paths.find((p) => p.startsWith('/customer-orders?'));
    expect(listCall).toBeDefined();
    expect(listCall).toContain('state=draft');
    // Do'kon cheklovi SERVERDA — FE saralashiga ishonib bo'lmaydi.
    expect(listCall).toContain(`storeId=${STORE_ID}`);
  });

  it('qator mijoz va summani ko‘rsatadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);

    await waitFor(() => expect(screen.getByText('ZKZ-00001')).toBeInTheDocument());
    expect(screen.getByText('Usta Vali')).toBeInTheDocument();
    expect(norm(screen.getByText(/45 000,00/).textContent)).toContain('45 000,00');
  });

  it('holat filtri serverga BOSHQA `state` yuboradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await waitFor(() => expect(screen.getByText('ZKZ-00001')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Tasdiqlangan' }));

    await waitFor(() => {
      const paths = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
      expect(paths.some((p) => p.includes('/customer-orders?state=confirmed'))).toBe(true);
    });
  });

  /**
   * 🔴 Chip yorliqlari `t(`orders_filter_${s}`)` — DINAMIK kalit, va
   * `i18n-key-existence` gate'i dinamik kalitlarni O'TKAZIB YUBORADI
   * (o'lchangan: «333 dynamic … skipped»). Ya'ni yo'q kalit gate yashil
   * holda prodga chiqib, ekranda `orders_filter_draft` bo'lib ko'rinardi.
   * Uchala yorliqni shu yerda ochiq qulflaymiz.
   */
  it('uchala holat chipi TARJIMA bilan chiziladi (dinamik kalit qulfi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);

    for (const label of ['Yangi', 'Tasdiqlangan', 'To‘lov kutilmoqda']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('zakaz yo‘q bo‘lsa bo‘sh holat chiqadi', async () => {
    vi.mocked(api.get).mockImplementation(
      router(orderRoutes([{ match: /^\/customer-orders\?/, value: { items: [], total: 0 } }])),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);

    expect(await screen.findByText('Zakaz yo‘q')).toBeInTheDocument();
  });
});

describe('F7 — zakaz detali', () => {
  it('pozitsiyalar, miqdor va rezerv ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await user.click(await screen.findByText('ZKZ-00001'));

    expect(await screen.findByText('Avtomat IEK 16A')).toBeInTheDocument();
    expect(screen.getByText('Gofra truba 20mm')).toBeInTheDocument();
    // Rezerv ustuni — F7 ning butun qiymati shu raqamda ko'rinadi.
    expect(screen.getAllByText(/Rezerv/).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith('/customer-orders/co-1');
  });
});

describe('F7 — tasdiqlash', () => {
  it('AYNAN `transitions/confirmed` yo‘liga POST qiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await user.click(await screen.findByText('ZKZ-00001'));
    await user.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/customer-orders/co-1/transitions/confirmed', {});
  });

  it('`draft` BO‘LMAGAN zakazda tugma umuman yo‘q', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          { match: /^\/customer-orders\/co-1$/, value: ORDER_DETAIL({ state: 'confirmed' }) },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await user.click(await screen.findByText('ZKZ-00001'));

    expect(await screen.findByText('Avtomat IEK 16A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
  });

  it('server xatosi kassirga KO‘RSATILADI (jim yutilmaydi)', async () => {
    vi.mocked(api.post).mockImplementation(
      router([
        {
          match: /transitions\/confirmed$/,
          value: new Error("O'tkazilmaydi: cancelled → confirmed"),
        },
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await user.click(await screen.findByText('ZKZ-00001'));
    await user.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));

    expect(await screen.findByText(/O'tkazilmaydi/)).toBeInTheDocument();
  });
});

describe('F7 — ruxsat', () => {
  it('`approve` yo‘q kassir tugmani KO‘RMAYDI (ro‘yxatni ko‘radi)', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          {
            match: /^\/permissions\/me$/,
            value: { matrix: { customerorder: { view: 'ALL', approve: 'NO' } } },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrdersTab(user);
    await user.click(await screen.findByText('ZKZ-00001'));

    expect(await screen.findByText('Avtomat IEK 16A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
  });

  it('`view` NO bo‘lsa yorliqning O‘ZI chizilmaydi', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          {
            match: /^\/permissions\/me$/,
            value: { matrix: { customerorder: { view: 'NO', approve: 'NO' } } },
          },
        ]),
      ),
    );
    renderWithProviders(<SotuvPage />);

    // Savat yorlig'i chizilgan bo'lsa ekran tayyor. Yorliq DASTLAB ko'rinadi
    // (matritsa hali yo'q — fail-open), shuning uchun YO'QOLISHINI kutamiz;
    // darhol tekshirish yolg'on-yashil bo'lardi.
    await screen.findByRole('button', { name: /^Savat/ });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Zakazlar/ })).not.toBeInTheDocument(),
    );
  });

  it('matritsa KELMASA yorliq KO‘RINADI (fail-open)', async () => {
    // Ruxsat so'rovi yiqilsa kassir yorliqni yo'qotmasin — haqiqiy qulf
    // serverda (`KioskGuard` allowlist'i + `@RequirePermission`). Bu qator
    // shu yerda ATAYLAB: aks holda `/permissions/me` ning har uzilishi POS
    // funksiyasini jimgina o'chirardi.
    expect(FULL_MATRIX.matrix.customerorder.view).toBe('ALL');
    vi.mocked(api.get).mockImplementation(
      router(orderRoutes([{ match: /^\/permissions\/me$/, value: new Error('permissions 500') }])),
    );
    renderWithProviders(<SotuvPage />);
    expect(await screen.findByRole('button', { name: /^Zakazlar/ })).toBeInTheDocument();
  });
});
