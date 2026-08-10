/**
 * MK32 — omborchiga yuborish + «Tayyor» chekni to'lash + aralash to'lov oynasi
 * (kassa TZ §6, §7, §11, §13.1).
 *
 * **Xulq O'ZGARTIRILMAYDI.** Bu yerda qulflanayotgan eng qimmat shartnomalar:
 *  · savat chegirmasi pozitsiyaga foiz sifatida YOZILADI (aks holda chek
 *    chegirmasiz summaga to'lanardi);
 *  · «Tayyor» chek to'langanda `expectedSumMinor` SERVER summasidan ketadi;
 *  · qaytim FAQAT naqddan (karta ortiqchasi tugmani bloklaydi);
 *  · qarz qoldig'i uchun mijoz MAJBURIY.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, SALE_DETAIL, SALE_ROW, at, norm, router, salesRoutes } from './harness';

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
  // F11 — smena yopilganda sahifa Z-hisobotni ham chop yo'liga uzatadi.
  printZReportViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

const COUNTERPARTIES = {
  items: [
    {
      id: 'cp-1',
      name: 'Usta Vali',
      phone: '+998 90 111 22 33',
      tags: ['usta'],
      companyType: 'individualUZ',
    },
  ],
};

/** «Tayyor» chek bor holat — to'lov oynasi shu yo'l bilan ochiladi. */
function readyRoutes(detail: Record<string, unknown> = {}): Route[] {
  return salesRoutes([
    { match: /^\/retail-sales\?.*state=ready/, value: { items: [SALE_ROW()] } },
    { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL(detail) },
    { match: /^\/counterparties\?/, value: COUNTERPARTIES },
  ]);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  vi.mocked(api.post).mockResolvedValue({ id: 'draft-1' });
});

// ── 1) Omborchiga yuborish ──────────────────────────────────────────────────

describe('SalesScreen — omborchiga yuborish', () => {
  it('savat qoralama yaratadi va darhol yig‘ishga uzatadi, so‘ng bo‘shaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(screen.getByTestId('sotuv-pay'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.post).mock.calls[0]).toEqual([
      '/retail-sales',
      {
        sessionId: '33333333-3333-4333-8333-333333333333',
        positions: [{ productId: 'p-1', quantity: '1', priceMinor: '1000000', discount: '0' }],
      },
    ]);
    expect(vi.mocked(api.post).mock.calls[1]).toEqual([
      '/retail-sales/draft-1/send-to-picking',
      {},
    ]);

    // Savat bo'shaydi — kassir keyingi mijozga tayyor.
    await waitFor(() => expect(screen.queryByTestId('sotuv-cart-line')).not.toBeInTheDocument());
  });

  it('savat chegirmasi HAR pozitsiyaga foiz bo‘lib yoziladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 1));
    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    await user.type(screen.getByPlaceholderText('0'), '10');
    await user.click(screen.getByTestId('sotuv-pay'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, { positions: unknown[] }];
    expect(body.positions).toEqual([
      { productId: 'p-1', quantity: '1', priceMinor: '1000000', discount: '10' },
      { productId: 'p-2', quantity: '1', priceMinor: '500000', discount: '10' },
    ]);
  });

  it('bo‘sh savatda tugma bloklangan — hech qanday so‘rov ketmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const btn = await screen.findByTestId('sotuv-pay');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ── 2) «Tayyor» chekni savatga yuklash ──────────────────────────────────────

describe('SalesScreen — «Tayyor» chekni to‘lovga olish', () => {
  it('«Tayyor» yorlig‘ida chek ko‘rinadi va «To‘lov» oynani ochadi', async () => {
    vi.mocked(api.get).mockImplementation(router(readyRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
    expect(await screen.findByText('CHEK-00001')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /To.lov/ }));

    // Oyna SERVER summasi bilan ochiladi (qayta hisoblangan raqam emas).
    const dialog = await screen.findByRole('dialog');
    expect(norm(dialog.textContent)).toContain('18 000,00 сум');
  });

  it('saqlangan chegirma TIKLANADI (savat chekni yolg‘on ko‘rsatmasin)', async () => {
    vi.mocked(api.get).mockImplementation(router(readyRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
    await user.click(await screen.findByRole('button', { name: /To.lov/ }));
    await screen.findByRole('dialog');

    // Savat ostida: 2 × 10 000 = 20 000, −10% ⇒ 18 000 — chek summasi bilan bir xil.
    const totals = screen.getByTitle('Chegirma uchun ikki marta bosing');
    expect(norm(totals.textContent)).toContain('20 000,00 сум');
    expect(norm(totals.textContent)).toContain('18 000,00 сум');
    expect(norm(totals.textContent)).toContain('−10% chegirma');
  });

  it('chegirmalar ARALASH bo‘lsa — savat chegirmasi 0 qoladi (jami baribir server summasi)', async () => {
    const positions = [
      ...SALE_DETAIL().positions,
      {
        id: 'pos-2',
        quantity: '1',
        priceMinor: '500000',
        sumMinor: '500000',
        discount: '0',
        costMinor: null,
        basePriceMinor: null,
        product: { id: 'p-2', name: 'Rozetka Legrand', code: 'R-002', buyPrice: '300000' },
      },
    ];
    vi.mocked(api.get).mockImplementation(router(readyRoutes({ positions, sumMinor: '2300000' })));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
    await user.click(await screen.findByRole('button', { name: /To.lov/ }));
    const dialog = await screen.findByRole('dialog');

    expect(norm(screen.getByTitle('Chegirma uchun ikki marta bosing').textContent)).not.toContain(
      'chegirma',
    );
    // To'lov oynasi hamon serverning `sumMinor`ini so'raydi.
    expect(norm(dialog.textContent)).toContain('23 000,00 сум');
  });
});

// ── 3) Aralash to'lov oynasi ────────────────────────────────────────────────

/** «Tayyor» chekni ochib to'lov oynasini qaytaradi. */
async function openPaymentModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
  await user.click(await screen.findByRole('button', { name: /To.lov/ }));
  return await screen.findByRole('dialog');
}

/** Hozir faol maydonga summa yozadi (major birlik). */
async function typeAmount(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(screen.getByPlaceholderText('0'), value);
}

describe('RasmiyashtirishModal — aralash to‘lov', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(router(readyRoutes()));
  });

  it('summa kiritilmagan — tugma bloklangan va sabab yozilgan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    expect(within(dialog).getByText("To'lov summasini kiriting")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled();
  });

  it('aniq naqd — «Aniq to‘landi» va so‘rov SERVER summasi bilan ketadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await typeAmount(user, '18000');
    expect(within(dialog).getByText(/Aniq to.landi/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/retail-sales/s-1/post', {
      cashAmountMinor: '1800000',
      cardAmountMinor: '0',
      terminalAmountMinor: '0',
      debtAmountMinor: '0',
      expectedSumMinor: '1800000',
    });
  });

  it('naqd + karta aralash — ikkala summa alohida yuboriladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await typeAmount(user, '10000');
    await user.click(within(dialog).getByRole('button', { name: /^Karta/ }));
    await typeAmount(user, '8000');

    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/retail-sales/s-1/post', {
      cashAmountMinor: '1000000',
      cardAmountMinor: '800000',
      terminalAmountMinor: '0',
      debtAmountMinor: '0',
      expectedSumMinor: '1800000',
    });
  });

  it('«Aniq summa» tugmasi QOLGAN summani qo‘yadi (allaqachon kiritilganini hisobga olib)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await typeAmount(user, '5000');
    await user.click(within(dialog).getByRole('button', { name: /^Karta/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Aniq summa' }));

    // 18 000 − 5 000 naqd = 13 000 kartaga.
    expect(screen.getByPlaceholderText('0')).toHaveValue(13000);
  });

  it('to‘liq to‘lanmagan va mijoz TANLANMAGAN — qarz yozib bo‘lmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await typeAmount(user, '10000');
    expect(within(dialog).getByText('Qoldi')).toBeInTheDocument();
    expect(within(dialog).getByText('Qarzga berish uchun mijoz tanlang')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled();
  });

  it('mijoz tanlangach qoldiq QARZ bo‘lib ketadi (`agentId` bilan)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await user.click(await within(dialog).findByRole('button', { name: /Usta Vali/ }));
    await typeAmount(user, '10000');

    expect(within(dialog).getByText('Qarz')).toBeInTheDocument();
    expect(within(dialog).getByText('Usta Vali ga yoziladi')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/retail-sales/s-1/post', {
      cashAmountMinor: '1000000',
      cardAmountMinor: '0',
      terminalAmountMinor: '0',
      debtAmountMinor: '800000',
      expectedSumMinor: '1800000',
      agentId: 'cp-1',
    });
  });

  it('naqd ortiqcha — qaytim ko‘rsatiladi va rasmiylashtirish ochiq', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await typeAmount(user, '20000');
    expect(within(dialog).getByText('Qaytim')).toBeInTheDocument();
    expect(norm(dialog.textContent)).toContain('2 000,00 сум');
    expect(within(dialog).getByRole('button', { name: /Rasmilashtirish/ })).toBeEnabled();
  });

  it('karta ortiqcha — qaytim naqddan chiqmaydi, tugma BLOKLANADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const dialog = await openPaymentModal(user);

    await user.click(within(dialog).getByRole('button', { name: /^Karta/ }));
    await typeAmount(user, '20000');

    expect(within(dialog).getByText(/Qaytim faqat naqddan beriladi/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Rasmilashtirish/ })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));
    expect(api.post).not.toHaveBeenCalled();
  });
});
