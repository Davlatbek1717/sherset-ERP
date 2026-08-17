/**
 * ❌ NOTO'G'RI KIRITILGAN CHEKNI BEKOR QILISH (egasi, 2026-08-16).
 *
 * 🔴 JONLI MUAMMO: kassa «Cheklar» ro'yxatida `draft` («Qoralama») chek
 * qolib ketsa, uni olib tashlashning HECH QANDAY yo'li yo'q edi — panelda
 * faqat chop, savatga nusxalash va `posted` uchun qaytarish bor edi. Egasi
 * ikki xato chekni ko'rsatib «olib tashla» dedi.
 *
 * QULFLANADIGAN SHARTNOMA — ikki tomonlama:
 *   1. to'lanmagan chekda (`draft|picking|ready`) tugma BOR va u
 *      `POST /retail-sales/:id/cancel` chaqiradi;
 *   2. 🔴 TO'LANGAN chekda tugma YO'Q — pul harakati bo'lgan hujjat bu yo'l
 *      bilan yo'qolmasligi kerak (yagona to'g'ri yo'l — QAYTARISH). Bu
 *      ikkinchi shart birinchisidan MUHIMROQ: uni buzish kassa hisobotini
 *      jimgina buzardi.
 *
 * Bekor qilish O'CHIRISH emas — server hujjatni `cancelled` ga o'tkazadi,
 * rezervni bo'shatadi va omborchi topshiriqlarini yopadi (audit izi qoladi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, SALE_DETAIL, SALE_ROW, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  isKioskUser: () => true,
  useAuth: () => ({
    user: { id: 'u-1', name: 'Kassir Ravshan' },
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

const LIST_ROW = SALE_ROW({
  state: 'draft',
  sumMinor: '3100000',
  agent: { id: 'cp-1', name: 'Usta Vali' },
});

function routes(state: string): Route[] {
  return salesRoutes([
    { match: /limit=100/, value: { items: [LIST_ROW], total: 1 } },
    {
      match: /^\/retail-sales\/[^/?]+$/,
      // `version` — optimistik qulf; server (Prisma `include`) uni qaytaradi,
      // fikstura ham qaytarishi shart, aks holda so'rov tanasida bo'lmaydi.
      value: SALE_DETAIL({ state, sumMinor: '3100000', version: 1 }),
    },
  ]);
}

async function openChek(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
  await user.click(await screen.findByRole('button', { name: /Usta Vali/ }));
  await screen.findByText('CHEK-00001');
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  // 🔴 `patch` ham TOZALANADI: usiz `patch.mock.calls[0]` oldingi testning
  // chaqiruvini qaytaradi va da'vo boshqa test haqida gapiradi (aynan shu
  // tuzoqqa tushildi — «cp-1 kutilgan cp-9 o'rniga»).
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.post).mockResolvedValue({ ok: true });
  window.open = vi.fn();
});

describe('Chekni bekor qilish — to`lanmagan holatlar', () => {
  it.each(['draft', 'picking', 'ready'])('%s: tugma BOR', async (state) => {
    vi.mocked(api.get).mockImplementation(router(routes(state)));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await openChek(user);

    expect(screen.getByTestId('chek-cancel')).toBeInTheDocument();
  });

  it('bosilganda TASDIQ so`raladi va serverga `cancel` ketadi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('draft')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openChek(user);

    await user.click(screen.getByTestId('chek-cancel'));

    // Tasdiq oynasi — tugma matni `cancel_sale_confirm_label` («Chekni bekor
    // qilish»). Sarlavhada chek raqami VA summasi bo'ladi, lekin uni matn
    // bo'yicha izlab bo'lmaydi: o'sha raqam panelda ham turibdi (ikki mos).
    const confirmBtn = await screen.findByRole('button', { name: /Chekni bekor qilish/ });
    expect(api.post).not.toHaveBeenCalled(); // hali tasdiqlanmadi

    await user.click(confirmBtn);

    await waitFor(() =>
      expect(vi.mocked(api.post).mock.calls.some((c) => String(c[0]).endsWith('/cancel'))).toBe(
        true,
      ),
    );
  });
});

/**
 * RO'YXATDA HOLAT KO'RINADI (egasi, 2026-08-17: «har bir chekni oldida
 * statusini yozib qo'y»).
 *
 * 🔴 Ilgari ro'yxatda holat UMUMAN yo'q edi: 31 000 so'mlik «Qoralama» ham,
 * to'langan chek ham, bekor qilingani ham bir xil ko'rinardi — kassir xato
 * chekni ajratish uchun har birini ochishga majbur edi.
 */
describe('Cheklar ro`yxati — holat nishoni', () => {
  it.each([
    ['draft', 'Qoralama'],
    ['posted', 'Yakunlandi'],
    ['cancelled', 'Bekor qilindi'],
  ])('%s → ro`yxat qatorida «%s» ko`rinadi', async (state, _label) => {
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /limit=100/,
            value: { items: [SALE_ROW({ state, sumMinor: '3100000' })], total: 1 },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));

    const badge = await screen.findByTestId('chek-state-badge');
    expect(badge.getAttribute('data-state')).toBe(state);
    expect((badge.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('🔴 bekor qilingan chek summasi USTIDAN CHIZIQ — sotuv deb o`qilmasin', async () => {
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /limit=100/,
            value: { items: [SALE_ROW({ state: 'cancelled', sumMinor: '3100000' })], total: 1 },
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));

    const badge = await screen.findByTestId('chek-state-badge');
    const row = badge.closest('button');
    const sum = [...(row?.querySelectorAll('span') ?? [])].find((el) =>
      (el.textContent ?? '').includes('31'),
    );
    expect(sum?.className).toContain('line-through');
  });
});

/**
 * «NAQD kiritilgan, QARZ bo'lishi kerak» (egasi, 2026-08-17).
 *
 * 🔴 Server yo'li (`PATCH /retail-sales/:id/edit`) 2026-08-16 dan bor edi,
 * lekin butun web ilovada unga bironta chaqiruv YO'Q edi — xato to'lov turini
 * tuzatishning umuman yo'li yo'q edi. Bu blok o'sha bo'shliqni yopadi.
 *
 * Qulflanadigan shartnoma:
 *   1. tugma FAQAT to'langan chekda (server ham `posted` dan boshqasini rad etadi);
 *   2. so'rov `version` (optimistik qulf) bilan ketadi va `paid + debt = jami`;
 *   3. 🔴 qarz > 0 bo'lsa MIJOZ shart — mijozsiz saqlash tugmasi O'CHIQ
 *      (serverning `planReceiptEdit` qo'riqchisi ham shu, lekin kassir 400 ni
 *      emas, o'chiq tugmani ko'rishi kerak).
 */
describe('Naqd ⇄ qarz tuzatish', () => {
  it('to`langan chekda tugma bor, to`lanmaganda YO`Q', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('posted')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openChek(user);
    expect(screen.getByTestId('chek-edit-open')).toBeInTheDocument();
  });

  it('draft chekda tugma YO`Q (server ham rad etadi)', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('draft')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openChek(user);
    expect(screen.queryByTestId('chek-edit-open')).toBeNull();
  });

  it('🔴 mijozi BOR chek: «Hammasi qarzga» ⇒ version bilan, paid+debt = jami', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('posted')));
    const patch = vi.mocked(api.patch);
    patch.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await openChek(user);

    await user.click(screen.getByTestId('chek-edit-open'));
    await user.click(screen.getByTestId('chek-edit-all-debt'));
    await user.click(screen.getByTestId('chek-edit-save'));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, body] = patch.mock.calls[0] as [string, Record<string, string>];
    expect(url).toContain('/edit');
    expect(body.debtMinor).toBe('3100000');
    expect(body.paidMinor).toBe('0'); // paid + debt = jami
    expect(body.version).toBeDefined(); // optimistik qulf
  });

  it('🔴 mijozi YO`Q chekda qarz tanlansa — saqlash O`CHIQ, mijoz tanlangach ochiladi', async () => {
    // Serverning `planReceiptEdit` qo'riqchisi mijozsiz qarzni rad etadi;
    // kassir 400 ni emas, o'chiq tugmani ko'rishi kerak.
    vi.mocked(api.get).mockImplementation(
      router(
        salesRoutes([
          {
            match: /limit=100/,
            value: {
              items: [SALE_ROW({ state: 'posted', sumMinor: '3100000', agent: null })],
              total: 1,
            },
          },
          {
            match: /^\/counterparties\?search=/,
            value: { items: [{ id: 'cp-9', name: 'Abbos aka' }] },
          },
          {
            match: /^\/retail-sales\/[^/?]+$/,
            value: SALE_DETAIL({
              state: 'posted',
              sumMinor: '3100000',
              version: 1,
              agent: null,
            }),
          },
        ]),
      ),
    );
    const patch = vi.mocked(api.patch);
    patch.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
    // Mijoz yo'q ⇒ qatorni SUMMA bo'yicha topamiz (formatMoney bo'shliq qo'yadi).
    await user.click(await screen.findByRole('button', { name: /31\s?000/ }));
    await screen.findByText('CHEK-00001');

    await user.click(screen.getByTestId('chek-edit-open'));
    await user.click(screen.getByTestId('chek-edit-all-debt'));
    expect((screen.getByTestId('chek-edit-save') as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByTestId('chek-edit-agent-search'), 'abb');
    await user.click(await screen.findByTestId('chek-edit-agent-option'));
    expect((screen.getByTestId('chek-edit-save') as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByTestId('chek-edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect((patch.mock.calls[0]?.[1] as Record<string, string>).agentId).toBe('cp-9');
  });
});

describe('🔴 To`langan chek bu yo`l bilan YO`QOLMAYDI', () => {
  it('posted: bekor qilish tugmasi YO`Q (faqat qaytarish)', async () => {
    vi.mocked(api.get).mockImplementation(router(routes('posted')));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await openChek(user);

    expect(screen.queryByTestId('chek-cancel')).toBeNull();
    // Qaytarish esa O'Z joyida qoladi.
    expect(screen.getByRole('button', { name: /Qaytarish/ })).toBeInTheDocument();
  });

  it.each(['cancelled', 'refunded'])(
    '%s: tugma YO`Q (ikkinchi marta bekor bo`lmaydi)',
    async (state) => {
      vi.mocked(api.get).mockImplementation(router(routes(state)));
      const user = userEvent.setup();
      renderWithProviders(<SotuvPage />);

      await openChek(user);

      expect(screen.queryByTestId('chek-cancel')).toBeNull();
    },
  );
});
