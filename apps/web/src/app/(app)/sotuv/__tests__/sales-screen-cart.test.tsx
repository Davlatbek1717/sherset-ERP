/**
 * MK32 — `SalesScreen` savat + chegirma xarakteristik testlari
 * (kassa TZ §5.1/§5.2/§5.3, §11, §13.1).
 *
 * **Xulq O'ZGARTIRILMAYDI** — bu testlar hozirgi ekran nima qilayotganini
 * qulflaydi, shundan keyingina (MK33) fayl uch komponentga bo'linadi.
 *
 * Qamrov: setka · savatga qo'shish/takrorlash · miqdor ±/o'chirish · tozalash ·
 * narx tahriri · narx tasmalari (ZARAR / optomdan past) · tan narx YO'Q holati ·
 * «tushirildi» · chek foydasi · chegirma (ochish, qo'llanishi, qisilishi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { PRODUCT, PRODUCTS, at, norm, router, salesRoutes } from './harness';

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

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
});

/** Ekranni ko'taradi va birinchi tovarni savatga qo'shadi. */
async function addFirstProduct(user: ReturnType<typeof userEvent.setup>) {
  const tiles = await screen.findAllByTestId('sotuv-product');
  await user.click(at(tiles, 0));
  return await screen.findByTestId('sotuv-cart-line');
}

/** Savat qatoridagi narx maydoniga yangi qiymat yozadi (major birlik). */
async function setPrice(
  user: ReturnType<typeof userEvent.setup>,
  line: HTMLElement,
  value: string,
) {
  const input = within(line).getByRole('textbox');
  await user.clear(input);
  await user.type(input, value);
}

describe('SalesScreen — tovar setkasi', () => {
  it('tovar, sotuv narxi, qoldiq va tan narx chiziladi', async () => {
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    expect(tiles).toHaveLength(2);
    expect(norm(at(tiles, 0).textContent)).toContain('Kabel 2×2.5');
    expect(norm(at(tiles, 0).textContent)).toContain('10 000,00 сум');
    expect(norm(at(tiles, 0).textContent)).toContain('Qoldiq: 12 dona');
    // «Kelgan» (tan narx) setkada HAM ko'rinadi — kassir ko'radigan raqam
    // savatda ham, setkada ham bir xil bo'lishi ataylab (§5.2 izohi).
    expect(norm(within(at(tiles, 0)).getByTestId('sotuv-grid-cost').textContent)).toContain(
      '6 000,00 сум',
    );
  });

  it('bo‘sh savat — «Savat bo‘sh» va «Omborchiga yuborish» bloklangan', async () => {
    renderWithProviders(<SotuvPage />);

    expect(await screen.findByText(/Savat bo.sh/)).toBeInTheDocument();
    expect(screen.getByTestId('sotuv-pay')).toBeDisabled();
    expect(screen.queryByTestId('sotuv-cart-line')).not.toBeInTheDocument();
  });

  it('qidiruvda Enter — birinchi topilgan tovarni qo‘shadi va maydonni tozalaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await screen.findAllByTestId('sotuv-product');

    const search = screen.getByTestId('sotuv-search');
    await user.type(search, 'kab');
    // Yangi qidiruv kaliti — ro'yxat qayta yuklanguncha kutamiz.
    await waitFor(() => expect(screen.getAllByTestId('sotuv-product')).toHaveLength(2));
    await user.type(search, '{Enter}');

    const line = await screen.findByTestId('sotuv-cart-line');
    expect(norm(line.textContent)).toContain('Kabel 2×2.5');
    expect(search).toHaveValue('');
  });
});

describe('SalesScreen — savat qatorlari', () => {
  it('tovarni bosish savatga qator qo‘shadi (kartochka narxi bilan)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    expect(within(line).getByRole('textbox')).toHaveValue('10000');
    expect(norm(line.textContent)).toContain('10 000,00 сум');
    // Jami + dona soni footerda.
    expect(norm(screen.getByText(/ta mahsulot/).textContent)).toBe('1 ta mahsulot');
  });

  it('bir tovarni ikki marta bosish — YANGI qator emas, miqdor 2 bo‘ladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 0));

    const lines = screen.getAllByTestId('sotuv-cart-line');
    expect(lines).toHaveLength(1);
    // Qator summasi 2 × 10 000.
    expect(norm(at(lines, 0).textContent)).toContain('20 000,00 сум');
    expect(norm(screen.getByText(/ta mahsulot/).textContent)).toBe('2 ta mahsulot');
  });

  it('«−» miqdorni kamaytiradi; 1 dan pastga tushsa qator YO‘QOLADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 0));
    let line = screen.getByTestId('sotuv-cart-line');

    await user.click(within(line).getByRole('button', { name: '−' }));
    line = screen.getByTestId('sotuv-cart-line');
    expect(norm(line.textContent)).toContain('10 000,00 сум');

    await user.click(within(line).getByRole('button', { name: '−' }));
    expect(screen.queryByTestId('sotuv-cart-line')).not.toBeInTheDocument();
    expect(await screen.findByText(/Savat bo.sh/)).toBeInTheDocument();
  });

  it('«✕» qatorni o‘chiradi, «Tozalash» butun savatni bo‘shatadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 1));
    expect(screen.getAllByTestId('sotuv-cart-line')).toHaveLength(2);

    await user.click(
      within(at(screen.getAllByTestId('sotuv-cart-line'), 0)).getByRole('button', {
        name: '✕',
      }),
    );
    expect(screen.getAllByTestId('sotuv-cart-line')).toHaveLength(1);

    await user.click(screen.getByTestId('sotuv-cart-clear'));
    expect(screen.queryByTestId('sotuv-cart-line')).not.toBeInTheDocument();
  });

  it('narx maydoni BO‘SHATILSA — ekranda bo‘sh, hisobda ESKI narx qoladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await user.clear(within(line).getByRole('textbox'));

    const after = screen.getByTestId('sotuv-cart-line');
    // Maydon bo'sh ko'rinadi...
    expect(within(after).getByRole('textbox')).toHaveValue('');
    // ...lekin qator summasi va foydasi HAMON eski narxdan hisoblanadi va
    // rasmiylashtirishda ham aynan shu narx ketadi (`page.tsx` updatePrice:
    // `Number.isNaN` bo'lsa `l.priceMinor` saqlanadi). Bu — QULFLANGAN FAKT,
    // tavsiya emas: hisobotdagi «K-3» kuzatuvi shu yerdan.
    expect(norm(after.textContent)).toContain('10 000,00 сум');
    expect(norm(within(after).getByTestId('sotuv-cart-profit').textContent)).toBe(
      'Foyda: +4 000,00 сум (40%)',
    );
  });

  it('narx maydoniga HARF yozilsa — narx o‘zgarmaydi (buzuq kiritma yutilmaydi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await setPrice(user, line, 'abc');

    const after = screen.getByTestId('sotuv-cart-line');
    expect(within(after).getByRole('textbox')).toHaveValue('abc');
    expect(norm(after.textContent)).toContain('10 000,00 сум');
  });

  it('narxni tahrirlash qator summasi va foydasini darhol siljitadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    // Boshlang'ich: 10 000 narx, 6 000 tan ⇒ +4 000 (40%).
    expect(norm(within(line).getByTestId('sotuv-cart-profit').textContent)).toBe(
      'Foyda: +4 000,00 сум (40%)',
    );

    await setPrice(user, line, '9000');
    const after = screen.getByTestId('sotuv-cart-line');
    expect(norm(after.textContent)).toContain('9 000,00 сум');
    expect(norm(within(after).getByTestId('sotuv-cart-profit').textContent)).toBe(
      'Foyda: +3 000,00 сум (33,3%)',
    );
  });
});

describe('SalesScreen — narx tasmalari (kassa TZ §5.2)', () => {
  it('kartochka narxida — tasma `ok`, ogohlantirish YO‘Q', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    expect(line).toHaveAttribute('data-price-band', 'ok');
    expect(within(line).queryByTestId('sotuv-cart-loss')).not.toBeInTheDocument();
    expect(within(line).queryByText('optomdan past')).not.toBeInTheDocument();
    // Kartochka narxida sotilgan qatorga «tushirildi» yozilmaydi.
    expect(within(line).queryByTestId('sotuv-cart-markdown')).not.toBeInTheDocument();
  });

  it('optom chegaradan past narx — sariq tasma + «tushirildi» summasi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await setPrice(user, line, '7000');

    const after = screen.getByTestId('sotuv-cart-line');
    expect(after).toHaveAttribute('data-price-band', 'below-wholesale');
    expect(within(after).getByText('optomdan past')).toBeInTheDocument();
    expect(within(after).queryByTestId('sotuv-cart-loss')).not.toBeInTheDocument();
    // Kartochka narxidan 3 000 pastga tushirilgan.
    expect(norm(within(after).getByTestId('sotuv-cart-markdown').textContent)).toBe(
      '−3 000,00 сум tushirildi',
    );
  });

  it('tan narxdan past narx — ZARAR tasmasi va MANFIY foyda', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    await setPrice(user, line, '5000');

    const after = screen.getByTestId('sotuv-cart-line');
    expect(after).toHaveAttribute('data-price-band', 'loss');
    expect(within(after).getByTestId('sotuv-cart-loss')).toHaveTextContent('ZARAR');
    expect(norm(within(after).getByTestId('sotuv-cart-profit').textContent)).toBe(
      'Foyda: -1 000,00 сум (-20%)',
    );
  });

  it('tan narx kartochkada YO‘Q — «—» chiziladi, «0 foyda» EMAS', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          { match: /^\/products\?/, value: { items: [PRODUCT({ buyPrice: null })], total: 1 } },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    expect(norm(within(line).getByTestId('sotuv-cart-cost').textContent)).toBe('· Tan: —');
    expect(norm(within(line).getByTestId('sotuv-cart-profit').textContent)).toBe('Foyda: —');
    // Chek foydasi ham raqam bermaydi — sabab yoziladi.
    expect(norm(screen.getByTestId('sotuv-cart-total-profit').textContent)).toMatch(
      /Chek foydasi: tan narx yig.ilmagan/,
    );
    // Tan narx yo'qligi ogohlantirish EMAS: tasma `ok` qoladi.
    expect(line).toHaveAttribute('data-price-band', 'ok');
  });

  it('chek foydasi = savat daromadi − tan narx (ikki qator ustidan)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0)); // 10 000 narx / 6 000 tan
    await user.click(at(tiles, 1)); // 5 000 narx / 3 000 tan

    expect(norm(screen.getByTestId('sotuv-cart-total-profit').textContent)).toBe(
      'Chek foydasi: +6 000,00 сум (40%)',
    );
  });
});

describe('SalesScreen — chek chegirmasi', () => {
  it('jami summani ikki marta bosish chegirma maydonini ochadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();
    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
  });

  it('chegirma qo‘llanadi: eski summa chizib tashlanadi, yangisi ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    await user.type(screen.getByPlaceholderText('0'), '10');

    const block = screen.getByTitle('Chegirma uchun ikki marta bosing');
    expect(norm(block.textContent)).toContain('10 000,00 сум'); // chizib tashlangan asl
    expect(norm(block.textContent)).toContain('9 000,00 сум'); // to'lanadigan
    expect(norm(block.textContent)).toContain('−10% chegirma');
  });

  it('chegirma QATOR summasiga tegmaydi — faqat chek jamiga (hozirgi xulq)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    const line = await addFirstProduct(user);

    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    await user.type(screen.getByPlaceholderText('0'), '10');

    // Qator hamon 10 000 (chegirma pozitsiyaga so'rovda yoziladi, ekranda emas),
    // qator foydasi ham kassir yozgan narxdan olinadi.
    expect(norm(line.textContent)).toContain('10 000,00 сум');
    expect(norm(within(line).getByTestId('sotuv-cart-profit').textContent)).toBe(
      'Foyda: +4 000,00 сум (40%)',
    );
    // Chek foydasi esa CHEGIRMALI daromaddan: 9 000 − 6 000 = 3 000.
    expect(norm(screen.getByTestId('sotuv-cart-total-profit').textContent)).toBe(
      'Chek foydasi: +3 000,00 сум (33,3%)',
    );
  });

  it('100 dan katta chegirma 100 ga QISILADI (manfiy jami bo‘lmaydi)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    await user.type(screen.getByPlaceholderText('0'), '150');

    const block = screen.getByTitle('Chegirma uchun ikki marta bosing');
    expect(norm(block.textContent)).toContain('−100% chegirma');
    expect(norm(block.textContent)).toContain('0,00 сум');
  });

  it('Enter maydonni yopadi, chegirma esa SAQLANADI', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addFirstProduct(user);

    await user.dblClick(screen.getByTitle('Chegirma uchun ikki marta bosing'));
    const input = screen.getByPlaceholderText('0');
    await user.type(input, '10{Enter}');

    await waitFor(() => expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument());
    expect(norm(screen.getByTitle('Chegirma uchun ikki marta bosing').textContent)).toContain(
      '−10% chegirma',
    );
  });
});

describe('SalesScreen — savat va tovar ro‘yxati bog‘lanishi', () => {
  it('ikkinchi tovar ALOHIDA qator bo‘ladi va jami ikkalasini qo‘shadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 1));

    const lines = screen.getAllByTestId('sotuv-cart-line');
    expect(lines).toHaveLength(2);
    expect(norm(at(lines, 1).textContent)).toContain('Rozetka Legrand');
    expect(norm(screen.getByTitle('Chegirma uchun ikki marta bosing').textContent)).toContain(
      '15 000,00 сум',
    );
  });

  it('savatga qo‘shilgan qator kartochkadagi optom chegarani ko‘rsatadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const line = await addFirstProduct(user);
    expect(norm(within(line).getByTestId('sotuv-cart-min').textContent)).toBe(
      '· Min: 8 000,00 сум',
    );
    expect(norm(within(line).getByTestId('sotuv-cart-cost').textContent)).toBe(
      '· Tan: 6 000,00 сум',
    );
    // Qoldiq kartochkadan olinadi.
    expect(norm(line.textContent)).toContain('Qolgan: 12');
  });

  it('savatdagi tovarlar soni tab yorlig‘idagi rozetkada ko‘rinadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    const tiles = await screen.findAllByTestId('sotuv-product');
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 0));
    await user.click(at(tiles, 1));

    const cartTab = screen.getByRole('button', { name: /^Savat/ });
    expect(within(cartTab).getByText('3')).toBeInTheDocument();
  });
});

/** PRODUCTS fikstura ikki tovarli — testlar shunga tayanadi. */
it('fikstura tekshiruvi: setkada aynan ikki tovar bor', () => {
  expect(PRODUCTS.items).toHaveLength(2);
});
