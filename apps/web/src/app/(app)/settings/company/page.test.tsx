import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanySettingsPage from './page';

/**
 * Q4 (2026-08-25) — «KASSA QARZI» sozlamasi kompaniya sozlamalari sahifasida.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q4 vazifa 4.
 *
 * Uch shartnoma shu yerda qulflanadi:
 *  1. **Sozlanmagan akkaunt bo'sh maydon ko'rmaydi** — server Q1 ning
 *     defaultini (14) qaytaradi va ekran AYNAN o'sha sonni ko'rsatadi.
 *  2. **`0` HAQIQIY qiymat** («o'sha kuniyoq muddati keladi») — u boshqa
 *     songa tuzatilib yuborilmaydi.
 *  3. **PUT to'liq sahifa holatini yozadi** — yangi maydon payload'ga
 *     tushadi, aks holda server 400 qaytarardi (qisman merge yo'q).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const SETTINGS = {
  globalOperationNumbering: false,
  emailReplyMode: 'EMPLOYEE' as const,
  checkShippingStock: false,
  checkMinPrice: false,
  useRecycleBin: true,
  useConsignments: false,
  showPositionAttributes: true,
  accountCountry: 'UZ',
  saleDebtTermDays: 14,
  exists: true,
  updatedAt: '2026-08-25T09:00:00.000Z',
};

function mount(over: Partial<typeof SETTINGS> = {}) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/company-settings')) return { ...SETTINGS, ...over } as never;
    if (url.startsWith('/countries')) return { items: [] } as never;
    return { items: [] } as never;
  });
  vi.mocked(api.put).mockResolvedValue({ ...SETTINGS, ...over } as never);
  return renderWithProviders(<CompanySettingsPage />);
}

describe('Q4 — kassa qarzi muddati sozlamasi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sozlanmagan akkauntda ham maydon BO`SH turmaydi — default 14', async () => {
    mount();
    const field = await screen.findByTestId('company-settings-sale-debt-term-days');
    expect(field).toHaveValue(14);
  });

  it('🔴 `0` qiymat AYNAN 0 bo`lib ko`rinadi (NULL bilan chalkashmaydi)', async () => {
    mount({ saleDebtTermDays: 0 });
    const field = await screen.findByTestId('company-settings-sale-debt-term-days');
    expect(field).toHaveValue(0);
  });

  it('o`zgartirilgan muddat PUT payload`iga TUSHADI (to`liq sahifa holati)', async () => {
    mount();
    const field = await screen.findByTestId('company-settings-sale-debt-term-days');

    await userEvent.clear(field);
    await userEvent.type(field, '30');
    // «Saqlash» tugmasi eski `data-testid` bilan belgilangan (vitest esa
    // `data-test-id` ni o'qiydi) — shuning uchun rol+nom bo'yicha topiladi.
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, payload] = vi.mocked(api.put).mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/company-settings');
    expect(payload.saleDebtTermDays).toBe(30);
    // Sahifaning qolgan maydonlari ham yuboriladi — server qisman merge
    // qilmaydi, yetishmagan maydon 400 berardi.
    expect(payload).toHaveProperty('accountCountry', 'UZ');
    expect(payload).not.toHaveProperty('exists');
  });

  it('sarlavha va izoh xom i18n kaliti bo`lib chizilmaydi', async () => {
    mount();
    await screen.findByTestId('company-settings-sale-debt-term-days');
    expect(screen.queryByText(/pages\.company_settings\.(sale_debt|label_saleDebt)/)).toBeNull();
  });
});
