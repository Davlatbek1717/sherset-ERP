/**
 * MK32 — `OpenShiftForm` xarakteristik testlari (kassa TZ §11, §13.1).
 *
 * Bu testlar **hozirgi** xulqni qulflaydi, uni yaxshilamaydi. Yiqilgan test =
 * bug (hisobotga yoziladi, tuzatish alohida fazada).
 *
 * Qamrov: smena biriktirilmagan · yuklanish · smena ma'lumotlari · ish vaqti
 * ichida ochish · vaqtdan tashqarida sababsiz ochib bo'lmasligi · sabab bilan
 * ochish · tugma yorlig'i/bloklanishi.
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { type Route, router } from './harness';

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

const SMENA = {
  id: 'sm-1',
  name: 'Kunduzgi',
  schedule: { name: 'Kunduzgi jadval', startTime: '09:00', endTime: '18:00' },
  organization: { id: 'org-1', name: 'Sherset MChJ' },
};

/** Smena YO'Q (`/cashier-sessions/current` → null) ⇒ sahifa `OpenShiftForm` beradi. */
function routes(mine: unknown, extra: Route[] = []): Route[] {
  return [
    { match: /^\/cashier-sessions\/current$/, value: null },
    { match: /^\/admin\/smenas\/mine$/, value: mine },
    ...extra,
  ];
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('OpenShiftForm — smena holati', () => {
  it('kassirga smena biriktirilmagan bo‘lsa — sarlavha + boshqarish havolasi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: null, withinShift: false })));
    renderWithProviders(<SotuvPage />);

    expect(await screen.findByText('Smena biriktirilmagan')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Smenalarni boshqarish/ });
    expect(link).toHaveAttribute('href', '/settings/smena');
    // Ochish tugmasi umuman chizilmaydi — bosadigan narsa yo'q.
    expect(screen.queryByRole('button', { name: 'Smena ochish' })).not.toBeInTheDocument();
  });

  it('smena bor — nomi, ish vaqti, tashkiloti chiziladi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: true })));
    renderWithProviders(<SotuvPage />);

    expect(await screen.findByText('Smenani ochish')).toBeInTheDocument();
    expect(screen.getByText('Kunduzgi')).toBeInTheDocument();
    expect(screen.getByText('Sherset MChJ')).toBeInTheDocument();
    // Ish vaqti ichida — vaqt yonida ✓, «vaqtdan tashqari» YO'Q.
    expect(screen.getByText(/09:00–18:00\s*✓/)).toBeInTheDocument();
    expect(screen.queryByText(/vaqtdan tashqari/)).not.toBeInTheDocument();
  });

  it('ish vaqtidan tashqarida — vaqt yonida ogohlantirish yorlig‘i turadi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: false })));
    renderWithProviders(<SotuvPage />);

    expect(await screen.findByText(/09:00–18:00\s*\(vaqtdan tashqari\)/)).toBeInTheDocument();
  });
});

describe('OpenShiftForm — smena ochish', () => {
  it('ish vaqti ICHIDA: bir bosishda ochiladi, sabab so‘ralmaydi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: true })));
    vi.mocked(api.post).mockResolvedValue({ id: 'sess-1' });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: 'Smena ochish' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/admin/smenas/open-session', {
      smenaId: 'sm-1',
      openingCashMinor: '0',
    });
  });

  it('vaqtdan TASHQARIDA: birinchi bosish so‘rov YUBORMAYDI — sabab maydonini ochadi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: false })));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: 'Smena ochish' }));

    expect(api.post).not.toHaveBeenCalled();
    expect(
      screen.getByPlaceholderText('Masalan: navbatchi kassir xastalik sababli kelmadi'),
    ).toBeInTheDocument();
    // Yorliq o'zgaradi va sabab bo'sh ekan — tugma bloklangan.
    const btn = screen.getByRole('button', { name: 'Sabab bilan ochish' });
    expect(btn).toBeDisabled();
  });

  it('vaqtdan tashqarida: sabab yozilgach so‘rov `outOfShiftReason` bilan ketadi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: false })));
    vi.mocked(api.post).mockResolvedValue({ id: 'sess-1' });
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: 'Smena ochish' }));
    await user.type(
      screen.getByPlaceholderText('Masalan: navbatchi kassir xastalik sababli kelmadi'),
      '  Navbatchi kelmadi  ',
    );
    await user.click(screen.getByRole('button', { name: 'Sabab bilan ochish' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    // Sabab TRIM qilinib yuboriladi.
    expect(api.post).toHaveBeenCalledWith('/admin/smenas/open-session', {
      smenaId: 'sm-1',
      openingCashMinor: '0',
      outOfShiftReason: 'Navbatchi kelmadi',
    });
  });

  it('faqat bo‘shliqdan iborat sabab — hamon bloklangan, so‘rov ketmaydi', async () => {
    vi.mocked(api.get).mockImplementation(router(routes({ smena: SMENA, withinShift: false })));
    const user = userEvent.setup();
    renderWithProviders(<SotuvPage />);

    await user.click(await screen.findByRole('button', { name: 'Smena ochish' }));
    await user.type(
      screen.getByPlaceholderText('Masalan: navbatchi kassir xastalik sababli kelmadi'),
      '   ',
    );

    expect(screen.getByRole('button', { name: 'Sabab bilan ochish' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
