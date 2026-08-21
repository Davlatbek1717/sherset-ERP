/**
 * CHEK IZOHI kassada (2026-08-19, egasi: «har bir chekka izoh ham qo'shish
 * funksiyasini qilish kerak»).
 *
 * Ikki oqim, ikkalasi ham qulflanadi:
 *  1. SAVATDA — chek yopilishidan OLDIN yozilgan izoh chek yaratish so'roviga
 *     `description` bo'lib qo'shiladi. Bo'sh izoh maydonni UMUMAN qo'shmaydi
 *     (server `null` ni ham qabul qiladi, lekin bo'sh satr yuborish chekda
 *     bo'sh «Izoh:» qatorini tug'dirardi).
 *  2. YOPILGAN CHEKDA — «Cheklar» panelidan tor yo'l (`PATCH :id/comment`)
 *     bilan tahrirlanadi: pul/holat so'roviga ARALASHMAYDI va `version`
 *     bilan ketadi (ikki kishi bir vaqtda yozsa server 409 beradi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { SALE_DETAIL, SALE_ROW, at, router, salesRoutes } from './harness';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
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
  printDebtReceiptViaAgent: vi.fn(async () => ({ handled: true, ok: true })),
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.get).mockImplementation(router(salesRoutes()));
  vi.mocked(api.post).mockResolvedValue({ id: 'draft-1', sumMinor: '1000000' });
  vi.mocked(api.patch).mockResolvedValue({ id: 'sale-1' });
});

/** Savatga bitta tovar qo'shadi. */
async function addOne(user: ReturnType<typeof userEvent.setup>) {
  const tiles = await screen.findAllByTestId('sotuv-product');
  await user.click(at(tiles, 0));
}

describe('Savat izohi — chek yaratish so‘roviga qo‘shiladi', () => {
  it('🔴 yozilgan izoh `description` bo‘lib ketadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addOne(user);

    await user.click(screen.getByTestId('sotuv-comment-add'));
    await user.type(screen.getByTestId('sotuv-comment-input'), 'Ertaga olib ketadi');
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({
      description: 'Ertaga olib ketadi',
    });
  });

  it('izoh yozilmagan bo‘lsa maydon UMUMAN yuborilmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addOne(user);
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, unknown>;
    expect('description' in body).toBe(false);
  });

  it('izoh savatda ko‘rinib turadi (kassir yozganini unutmasin)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);
    await addOne(user);

    await user.click(screen.getByTestId('sotuv-comment-add'));
    await user.type(screen.getByTestId('sotuv-comment-input'), 'Qarzga');
    // Fokusdan chiqqach matn ko'rinishga o'tadi.
    await user.click(screen.getByTestId('sotuv-sell-direct'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({ description: 'Qarzga' });
  });
});

describe('Yopilgan chek izohi — «Cheklar» paneli', () => {
  /** Panelni ochish uchun yetarli yo'llar: ro'yxat + detal. */
  function detailRoutes(detail: Record<string, unknown> = {}) {
    return salesRoutes([
      {
        match: /limit=100/,
        value: {
          items: [
            SALE_ROW({
              state: 'posted',
              sumMinor: '1800000',
              agent: { id: 'cp-1', name: 'Usta Vali' },
            }),
          ],
          total: 1,
        },
      },
      { match: /^\/retail-sales\/[^/?]+$/, value: SALE_DETAIL({ version: 7, ...detail }) },
    ]);
  }

  async function openDetail(
    user: ReturnType<typeof userEvent.setup>,
    detail: Record<string, unknown> = {},
  ) {
    vi.mocked(api.get).mockImplementation(router(detailRoutes(detail)));
    renderWithProviders(<SotuvPage />);
    await user.click(await screen.findByRole('button', { name: /^Cheklar/ }));
    await user.click(await screen.findByRole('button', { name: /Usta Vali/ }));
    await screen.findByText('CHEK-00001');
  }

  it('🔴 izoh TOR yo‘l bilan saqlanadi: PATCH :id/comment + version', async () => {
    const user = userEvent.setup();
    await openDetail(user);

    await user.click(screen.getByTestId('chek-comment-open'));
    await user.type(screen.getByTestId('chek-comment-input'), 'Mijoz keyin keladi');
    await user.click(screen.getByTestId('chek-comment-save'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [path, body] = vi.mocked(api.patch).mock.calls[0] ?? [];
    expect(path).toMatch(/\/retail-sales\/[^/]+\/comment$/);
    expect(body).toEqual({ version: 7, description: 'Mijoz keyin keladi' });
  });

  it('bo‘sh matn izohni OLIB TASHLAYDI — serverga null ketadi', async () => {
    const user = userEvent.setup();
    await openDetail(user, { description: 'eski izoh' });

    await user.click(screen.getByTestId('chek-comment-open'));
    await user.clear(screen.getByTestId('chek-comment-input'));
    await user.click(screen.getByTestId('chek-comment-save'));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(vi.mocked(api.patch).mock.calls[0]?.[1]).toEqual({ version: 7, description: null });
  });

  it('mavjud izoh panelda ko‘rinadi', async () => {
    const user = userEvent.setup();
    await openDetail(user, { description: 'Chegirma kelishildi' });

    expect(await screen.findByTestId('chek-comment-text')).toHaveTextContent('Chegirma kelishildi');
  });
});
