/**
 * F8 — zakazni POS'dan to'lash (chek ↔ zakaz bog'lanishi).
 *
 * Qulflanadigan shartnomalar:
 *  · «To'lash» tugmasi FAQAT to'lanadigan holatda (`confirmed` /
 *    `awaiting_payment`) — `draft` da yo'q, chunki rezerv hali tushmagan
 *    va server ham rad etadi (`ORDER_PAYABLE_STATES`);
 *  · tugma chekni AYNAN `customerOrderId` bilan yaratadi — bu F8 ning yadrosi
 *    (ustun sxemada bor edi, unga yozuvchi yo'q edi);
 *  · pozitsiyalar zakazdan keladi — miqdor DECIMAL SATR (`1.5`), narx va
 *    chegirma zakazniki;
 *  · kasr miqdorli zakaz savatni YIQITMAYDI (`BigInt(1.5)` RangeError klassi);
 *  · zakazga bog'langan savat TAHRIRLANMAYDI — narx/miqdor o'zgarsa chek
 *    zakaz summasidan ayrilib, zakaz jimgina «to'liq to'lanmagan» bo'lib
 *    qolardi;
 *  · to'lov mavjud yo'l bilan ketadi: `POST /retail-sales/:id/post`.
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
  hasNativePrinting: vi.fn(() => false),
  fetchAgentPrinters: vi.fn(async () => []),
  printReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
  printPickingViaAgent: vi.fn(async () => ({ handled: true, printed: 1, skipped: 0, errors: 0 })),
  printZReportViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

const STORE_ID = '66666666-6666-4666-8666-666666666666';
const ORDER_ID = 'co-1';
const NEW_SALE_ID = 'sale-from-order-1';

function ORDER_ROW(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    name: 'ZKZ-00001',
    moment: '2026-08-10T09:00:00.000Z',
    sumMinor: '4500000',
    state: 'confirmed',
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
        reservedQty: '3',
        priceMinor: '1000000',
        discount: '0',
        product: { id: 'p-9', name: 'Avtomat IEK 16A', code: 'A-016', uom: 'dona' },
      },
      {
        id: 'cop-2',
        quantity: '2',
        reservedQty: '2',
        priceMinor: '750000',
        discount: '0',
        product: { id: 'p-8', name: 'Gofra truba 20mm', code: 'G-020', uom: 'm' },
      },
    ],
    ...over,
  };
}

function orderRoutes(over: Route[] = []): Route[] {
  return salesRoutes([
    ...over,
    { match: /^\/customer-orders\/co-1$/, value: ORDER_DETAIL() },
    { match: /^\/customer-orders\?/, value: { items: [ORDER_ROW()], total: 1 } },
  ]);
}

function postRoutes(over: Route[] = []): Route[] {
  return [
    ...over,
    { match: /^\/retail-sales$/, value: { id: NEW_SALE_ID, sumMinor: '4500000' } },
    { match: /^\/retail-sales\/.*\/post$/, value: { id: NEW_SALE_ID, state: 'posted' } },
  ];
}

async function openOrderDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Zakazlar/ }));
  await user.click(await screen.findByText('ZKZ-00001'));
  await screen.findByText('Avtomat IEK 16A');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(orderRoutes()));
  vi.mocked(api.post).mockImplementation(router(postRoutes()));
  window.open = vi.fn();
});

describe('F8 — «To‘lash» tugmasi', () => {
  it('tasdiqlangan zakazda ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);

    expect(await screen.findByRole('button', { name: 'To‘lash' })).toBeInTheDocument();
  });

  it('🔴 `draft` zakazda YO‘Q — rezerv hali tushmagan, server ham rad etadi', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          { match: /^\/customer-orders\/co-1$/, value: ORDER_DETAIL({ state: 'draft' }) },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);

    expect(screen.queryByRole('button', { name: 'To‘lash' })).toBeNull();
    // Tasdiqlash tugmasi esa aynan shu holatda TURADI (F7).
    expect(screen.getByRole('button', { name: 'Tasdiqlash' })).toBeInTheDocument();
  });

  it('🔴 `paid` zakazda YO‘Q — ikki marta to‘lash yo‘li ekranda ham yopiq', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          { match: /^\/customer-orders\/co-1$/, value: ORDER_DETAIL({ state: 'paid' }) },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);

    expect(screen.queryByRole('button', { name: 'To‘lash' })).toBeNull();
  });
});

describe('F8 — chek zakazga bog‘lanadi', () => {
  it('AYNAN `customerOrderId` bilan chek yaratadi (F8 yadrosi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    await waitFor(() => {
      const call = vi.mocked(api.post).mock.calls.find((c) => String(c[0]) === '/retail-sales');
      expect(call).toBeDefined();
    });
    const body = vi
      .mocked(api.post)
      .mock.calls.find((c) => String(c[0]) === '/retail-sales')?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(body?.customerOrderId).toBe(ORDER_ID);
    // Mijoz ham chekka tushadi — loyalty/qarz shu maydondan o'qiydi.
    expect(body?.agentId).toBe('cp-1');
    expect(body?.positions).toEqual([
      { productId: 'p-9', quantity: '3', priceMinor: '1000000', discount: '0' },
      { productId: 'p-8', quantity: '2', priceMinor: '750000', discount: '0' },
    ]);
  });

  it('kasr miqdorli zakaz pozitsiyasi DECIMAL SATR bo‘lib ketadi', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          {
            match: /^\/customer-orders\/co-1$/,
            value: ORDER_DETAIL({
              sumMinor: '1500000',
              positions: [
                {
                  id: 'cop-1',
                  quantity: '1.500000',
                  reservedQty: '1.5',
                  priceMinor: '1000000',
                  discount: '0',
                  product: { id: 'p-9', name: 'Kabel VVG 3×2.5', code: 'K-777', uom: 'm' },
                },
              ],
            }),
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await user.click(await screen.findByRole('button', { name: /^Zakazlar/ }));
    await user.click(await screen.findByText('ZKZ-00001'));
    await screen.findByText('Kabel VVG 3×2.5');
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    await waitFor(() => {
      const call = vi.mocked(api.post).mock.calls.find((c) => String(c[0]) === '/retail-sales');
      expect(call).toBeDefined();
    });
    const body = vi
      .mocked(api.post)
      .mock.calls.find((c) => String(c[0]) === '/retail-sales')?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(body?.positions).toEqual([
      { productId: 'p-9', quantity: '1.5', priceMinor: '1000000', discount: '0' },
    ]);
  });

  /**
   * 🔴 AUDIT bug-klassi: `BigInt(1.5)` RangeError otadi va React render'i
   * ichida otilgan xato BUTUN POS ni oq ekranga aylantiradi. Bu test savat
   * chizilishini talab qiladi — ya'ni kasr miqdorli qator ko'rinsa, sahifa
   * omon.
   */
  it('🔴 kasr miqdor savatni YIQITMAYDI (RangeError klassi)', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        orderRoutes([
          {
            match: /^\/customer-orders\/co-1$/,
            value: ORDER_DETAIL({
              sumMinor: '1500000',
              positions: [
                {
                  id: 'cop-1',
                  quantity: '1.5',
                  reservedQty: '1.5',
                  priceMinor: '1000000',
                  discount: '0',
                  product: { id: 'p-9', name: 'Kabel VVG 3×2.5', code: 'K-777', uom: 'm' },
                },
              ],
            }),
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await user.click(await screen.findByRole('button', { name: /^Zakazlar/ }));
    await user.click(await screen.findByText('ZKZ-00001'));
    await screen.findByText('Kabel VVG 3×2.5');
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    // Savat qatori chizildi — sahifa omon.
    const lines = await screen.findAllByTestId('sotuv-cart-line');
    expect(lines).toHaveLength(1);
    // 1.5 × 10 000 = 15 000
    expect(norm(lines[0]?.textContent)).toContain('15 000,00');
  });

  it('zakazga bog‘langan savat TAHRIRLANMAYDI (narx/miqdor qulflangan)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    const lines = await screen.findAllByTestId('sotuv-cart-line');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      // Tahrir vositalari YO'Q: narx maydoni ham, ±/✕ tugmalari ham.
      expect(line.querySelectorAll('input')).toHaveLength(0);
      for (const name of ['−', '+', '✕']) {
        expect(within(line).queryByRole('button', { name })).toBe(null);
      }
    }
  });

  /**
   * F2 — savat qatorini bosish katta tahrir oynasini ochadi. Qulflangan
   * savatda oyna FAQAT KO'RISH bo'lishi shart (`readOnly={cartLocked}`), aks
   * holda kassa zakaz qulfini oyna orqali chetlab o'tardi.
   *
   * 🔴 O'LCHANGAN FAKT (F2 sessiyasi): `payingOrderId` FAQAT
   * `setCheckoutOpen(true)` bilan birga qo'yiladi va rasmiylashtirish oynasi
   * yopilganda darhol tozalanadi. Ya'ni qulflangan savat HAR DOIM ochiq
   * modal ortida turadi — Radix fon ustiga `pointer-events: none` qo'yadi va
   * qatorni bosib bo'lmaydi. Shu sababli bu yerdagi tekshiruv «bosib ochish»
   * emas, QULF O'ZI: qatorda tahrir vositalari yo'q (yuqoridagi test) va
   * oynaning read-only shartnomasi komponent darajasida qulflangan
   * (`components/pos/__tests__/cart-line-edit-modal.test.tsx`).
   */
  it('qulflangan savat qatorida tahrir triggeri bor, lekin fon bosilmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    const lines = await screen.findAllByTestId('sotuv-cart-line');
    // Trigger chizilgan (nom o'sha tugma), lekin u modal ortida —
    // rasmiylashtirish oynasi ochiq turganda savat butunlay erishilmas.
    expect(within(lines[0] as HTMLElement).getByTestId('sotuv-cart-line-edit')).toHaveTextContent(
      'Avtomat IEK 16A',
    );
    expect(screen.queryByTestId('pos-line-edit')).not.toBeInTheDocument();
  });

  it('to‘lov mavjud yo‘l bilan ketadi — `POST /retail-sales/:id/post`', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openOrderDetail(user);
    await user.click(await screen.findByRole('button', { name: 'To‘lash' }));

    // Rasmiylashtirish oynasi zakaz summasi bilan ochildi — naqd 45 000 so'm.
    await user.type(await screen.findByPlaceholderText('0'), '45000');
    await user.click(await screen.findByRole('button', { name: /Rasmilashtirish/ }));

    await waitFor(() => {
      const paths = vi.mocked(api.post).mock.calls.map((c) => String(c[0]));
      expect(paths).toContain(`/retail-sales/${NEW_SALE_ID}/post`);
    });
  });
});
