/**
 * MK32-audit tuzatishlari — 5 tasdiqlangan bug uchun regressiya qulflari.
 *
 * Bu fayl xarakteristik testlardan FARQLI: u eski (buggy) xulqni emas,
 * TUZATILGAN xulqni qulflaydi:
 *  · K-3 — narx parse bo'lmasa (bo'sh satr, harf) qator narxi 0n bo'ladi —
 *    ko'ringan narsa = rasmiylashtirishga ketadigan narsa;
 *  · «Tayyor» chek to'langach savat va chegirma TOZALANADI (dublikat sotuv
 *    xavfi yopiladi);
 *  · smena yopish sanog'ida `5e3` kabi kiritma sahifani YIQITMAYDI
 *    (`type="number"` `e` harfini o'tkazadi, buzuq kiritma 0 deb sanaladi);
 *  · K-2 — manfiy dollar farqi `-$10.00` ko'rinishida (`$-10.00` EMAS).
 */

import { api } from '@/lib/api-client';
import { fireEvent, renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
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

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  vi.mocked(api.post).mockResolvedValue({ id: 'draft-1' });
  // Chek chiqarish oynasi — testda ochilmasin.
  window.open = vi.fn();
});

/** Ekranni ko'taradi va birinchi tovarni savatga qo'shadi. */
async function addFirstProduct(user: ReturnType<typeof userEvent.setup>) {
  const tiles = await screen.findAllByTestId('sotuv-product');
  await user.click(at(tiles, 0));
  return await screen.findByTestId('sotuv-cart-line');
}

// ── K-3: parse bo'lmagan narx = 0, ESKI narx EMAS ───────────────────────────

describe('K-3 — narx maydoni parse bo‘lmasa qator narxi 0 bo‘ladi', () => {
  it('maydon BO‘SHATILSA — qator summasi 0, jami 0, ZARAR tasmasi ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await user.clear(within(line).getByRole('textbox'));

    const after = screen.getByTestId('sotuv-cart-line');
    expect(within(after).getByRole('textbox')).toHaveValue('');
    // Qator summasi 0 — ekranda ko'ringan bo'sh narx aynan 0 deb hisoblanadi;
    // «tushirildi» yorlig'i kartochka narxidan TO'LIQ 10 000 pasayishni ko'rsatadi.
    expect(norm(after.textContent)).toContain('Narx:0,00 сум');
    expect(norm(within(after).getByTestId('sotuv-cart-markdown').textContent)).toBe(
      '−10 000,00 сум tushirildi',
    );
    // 0 narx tan narxdan past — kassir buni ZARAR tasmasi orqali darhol ko'radi.
    expect(within(after).getByTestId('sotuv-cart-loss')).toBeInTheDocument();
    // Footer jami ham 0 — footer bilan qator bir manbadan gapiradi.
    expect(norm(screen.getByTitle('Chegirma uchun ikki marta bosing').textContent)).toContain(
      '0,00 сум',
    );
  });

  it('bo‘sh narx bilan rasmiylashtirishga AYNAN 0 ketadi (eski narx emas)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await user.clear(within(line).getByRole('textbox'));
    await user.click(screen.getByTestId('sotuv-pay'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, { positions: unknown[] }];
    expect(body.positions).toEqual([
      { productId: 'p-1', quantity: '1', priceMinor: '0', discount: '0' },
    ]);
  });

  it('HARF yozilsa ham narx 0 bo‘ladi (buzuq kiritma eski narxni yashirmaydi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    const input = within(line).getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'abc');

    const after = screen.getByTestId('sotuv-cart-line');
    expect(within(after).getByRole('textbox')).toHaveValue('abc');
    expect(norm(after.textContent)).toContain('Narx:0,00 сум');
    expect(norm(within(after).getByTestId('sotuv-cart-profit').textContent)).toContain(
      'Foyda: -6 000,00 сум',
    );
  });
});

// ── «Tayyor» chek to'langach savat tozalanadi ───────────────────────────────

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
function readyRoutes(): Route[] {
  return salesRoutes([
    { match: /^\/retail-sales\?.*state=ready/, value: { items: [SALE_ROW()] } },
    { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL() },
    { match: /^\/counterparties\?/, value: COUNTERPARTIES },
  ]);
}

describe('To‘lovdan keyin savat tozalanadi (dublikat sotuv xavfi)', () => {
  it('«Tayyor» chek to‘langach savat BO‘SH va chegirma 0 qoladi', async () => {
    vi.mocked(api.get).mockImplementation(router(readyRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /Tayyor/ }));
    await user.click(await screen.findByRole('button', { name: /To.lov/ }));
    const dialog = await screen.findByRole('dialog');

    // `loadReadyToCart` savatni to'ldirgan (chek pozitsiyalari echosi).
    expect(screen.getAllByTestId('sotuv-cart-line')).toHaveLength(1);

    await user.type(within(dialog).getByPlaceholderText('0'), '18000');
    await user.click(within(dialog).getByRole('button', { name: /Rasmilashtirish/ }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/retail-sales/s-1/post', expect.anything()),
    );

    // Savat bo'sh — keyingi «Omborchiga yuborish» endi shu chekni
    // dublikat sotuv qilib yarata olmaydi.
    await waitFor(() => expect(screen.queryByTestId('sotuv-cart-line')).not.toBeInTheDocument());
    expect(await screen.findByText(/Savat bo.sh/)).toBeInTheDocument();
    // Chegirma ham tiklangan holatidan (10%) 0 ga qaytgan — jami blokida
    // chegirma yozuvi qolmaydi.
    expect(norm(screen.getByTitle('Chegirma uchun ikki marta bosing').textContent)).not.toContain(
      'chegirma',
    );
  });
});

// ── Smena yopish sanog'i: `5e3` sahifani yiqitmaydi ─────────────────────────

function usdShiftRoutes(): Route[] {
  return salesRoutes([
    {
      match: /\/z-report$/,
      value: { expectedCashMinor: '5000000', expectedUsdCashMinor: '10000' },
    },
    { match: /^\/expense-items/, value: { items: [] } },
    { match: /^\/cashier-sessions\/cash-out-recipients$/, value: [] },
    { match: /^\/counterparties\?/, value: { items: [] } },
  ]);
}

/** «Smena» yorlig'iga o'tib, yopish formasini ochadi. */
async function openCloseForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Smena/ }));
  await user.click(screen.getByRole('button', { name: 'Smenani yopish' }));
  await screen.findByText('Kutilgan naqd');
}

describe('Smena yopish — `5e3` kiritmasi sahifani yiqitmaydi', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(router(usdShiftRoutes()));
  });

  it('so‘m sanog‘ida `5e3` — crash YO‘Q, 0 deb sanaladi (kamomad ko‘rinadi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openCloseForm(user);

    // `type="number"` maydoni `5e3` ni «to'g'ri son» deb qabul qiladi —
    // userEvent oraliq `5e` holatida qiymatni tozalab yuborardi, shuning
    // uchun brauzerdagi yakuniy holat fireEvent bilan qo'yiladi.
    fireEvent.change(screen.getByPlaceholderText(/Kassadagi naqd pul/), {
      target: { value: '5e3' },
    });

    // Sahifa tirik va farq 0 sanoqdan hisoblangan: 0 − 50 000 = kamomad.
    expect(norm(screen.getByTestId('close-variance').textContent)).toBe('Kamomad-50 000,00 сум');
  });

  it('dollar sanog‘ida `5e3` — crash YO‘Q, $0 deb sanaladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openCloseForm(user);

    fireEvent.change(await screen.findByTestId('close-cash-usd'), {
      target: { value: '5e3' },
    });

    // 0 − $100 = −$100 kamomad; minus `$` dan OLDIN (K-2 bilan bir formatda).
    expect(norm(screen.getByTestId('close-variance-usd').textContent)).toBe('Kamomad-$100.00');
  });
});

// ── K-2: manfiy dollar farqi `-$10.00` ──────────────────────────────────────

describe('K-2 — dollar farqida minus `$` dan OLDIN', () => {
  it('kamomad `-$10.00` ko‘rinishida chiqadi (so‘m qatori bilan bir xil o‘qiladi)', async () => {
    vi.mocked(api.get).mockImplementation(router(usdShiftRoutes()));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openCloseForm(user);

    await user.type(await screen.findByTestId('close-cash-usd'), '90');

    expect(norm(screen.getByTestId('close-variance-usd').textContent)).toBe('Kamomad-$10.00');
    // Musbat «kutilgan» qatori esa oddiy `$100.00` bo'lib qoladi.
    expect(screen.getByText('Kutilgan dollar').parentElement?.textContent).toContain('$100.00');
  });
});
