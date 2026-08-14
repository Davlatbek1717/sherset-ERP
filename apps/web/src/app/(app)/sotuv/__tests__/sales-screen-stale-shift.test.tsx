/**
 * P4 — «UNUTILGAN SMENA» OGOHLANTIRISHI (POS ekrani).
 *
 * 🔴 O'LCHANGAN MUAMMO (prod, 2026-08-12): uchta smena ochiq, hech biri hech
 * qachon yopilmagan, bittasi **11 kundan beri**. Ekranda esa 11 kunlik smena
 * endi ochilganidan farq qilmasdi — bir xil yashil «Smena ochiq» yorlig'i.
 *
 * Bu fayl qulflaydigan shartnomalar:
 *   · yosh HAR DOIM ko'rinadi (egasi shuni so'radi: «ochildi degandan
 *     yopildi qilguncha»);
 *   · «eskirgan» bayrog'ini SERVER qo'yadi (`stale`) — ekran chegarani
 *     o'zi hisoblamaydi, aks holda chegara ikki joyda ikki xil bo'lardi;
 *   · ogohlantirish paydo bo'lganda ham ekran ISHLASHDA qoladi (avto-yopish
 *     ham, bloklash ham yo'q — sanoqsiz yopilgan smena kassa hisobini
 *     yolg'onlashtiradi).
 */

import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SotuvPage from '../page';
import { SESSION, router, salesRoutes } from './harness';

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
}));

function mountWith(over: Parameters<typeof SESSION>[0]) {
  vi.mocked(api.get).mockImplementation(
    router(salesRoutes([{ match: /^\/cashier-sessions\/current$/, value: SESSION(over) }])),
  );
  renderWithProviders(<SotuvPage />);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('P4 — smena yoshi ekranda', () => {
  // F3 (POS redizayn): yosh endi setka ustidagi strip'da EMAS — strip olib
  // tashlandi (header-chip bilan dublikat edi, F2 hisoboti №3). Niyat
  // O'ZGARMADI: yosh HAR DOIM ko'rinadi — endi PosHeader smena-chip'ida.
  it('yangi smenada yosh ko`rinadi (header-chip), ogohlantirish YO`Q', async () => {
    mountWith({ openMinutes: 125, stale: false });
    const chip = await screen.findByTestId('pos-header-shift-chip');
    // 2 soat 5 daqiqa.
    expect(chip.textContent).toContain('2');
    expect(screen.queryByTestId('sotuv-shift-stale')).toBeNull();
  });

  it('🔴 `stale` bo`lsa ogohlantirish paneli chiqadi va DAVOMIYLIKNI aytadi', async () => {
    mountWith({ openMinutes: 11 * 24 * 60, stale: true, staleWarnHours: 12 });
    const alert = await screen.findByTestId('sotuv-shift-stale');
    expect(alert.textContent).toContain('11');
    // Kassir nima qilishini bilishi shart.
    expect(alert.textContent).toMatch(/sana|Пересчит/i);
  });

  it('ogohlantirish sotuvni BLOKLAMAYDI — ekran ishlashda qoladi', async () => {
    mountWith({ openMinutes: 11 * 24 * 60, stale: true });
    await screen.findByTestId('sotuv-shift-stale');
    // Qidiruv maydoni va tovar kartochkalari joyida.
    await waitFor(() => expect(screen.getByTestId('sotuv-search')).toBeTruthy());
    expect(screen.getAllByTestId('sotuv-product').length).toBeGreaterThan(0);
  });

  it('bayroqni SERVER qo`yadi: yosh katta, lekin `stale:false` bo`lsa panel yo`q', async () => {
    // Chegara o'chirilgan yoki kattaroq qilib sozlangan holat. Ekran o'zi
    // «12 soatdan oshdi» deb qaror QILMAYDI.
    mountWith({ openMinutes: 5 * 24 * 60, stale: false, staleWarnHours: null });
    await screen.findByTestId('pos-header-shift-chip');
    expect(screen.queryByTestId('sotuv-shift-stale')).toBeNull();
  });
});
