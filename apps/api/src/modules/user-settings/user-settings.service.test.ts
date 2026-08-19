import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserSettingsService } from './user-settings.service.js';

/**
 * «Основной склад» fallback (2026-08-19 — jonli prod bug).
 *
 * Sukut ombori qo'yilmagan xodim uchun hujjat shakllari zaxira sifatida
 * `/stores` ro'yxatining BIRINCHI elementini olardi. Ro'yxat NOM bo'yicha
 * saralanadi ⇒ alifboda birinchi turgan ombor tanlanardi. Prodda bu bo'sh
 * «Ombor 1» edi (butun qoldiq «Ombor 2» da): har yangi hujjat «На складе: 0»
 * ko'rsatdi va ikkita haqiqiy qabul (27,7 mln so'm) noto'g'ri omborga tushdi.
 *
 * Shartnoma: server har doim `mainStore` ni qaytaradi — akkauntning ASOSIY
 * ombori = eng birinchi yaratilgan, arxivlanmagan ombor (moysklad «основной
 * склад» semantikasi). Alifbo tartibi hech qachon zaxira bo'lmaydi.
 */
describe('UserSettingsService.getForEmployee — mainStore fallback', () => {
  const OLDEST = { id: 'store-old', name: 'Ombor 2' };
  let settingsRow: Record<string, unknown>;
  let storeFindFirst: ReturnType<typeof vi.fn>;
  let svc: UserSettingsService;

  beforeEach(() => {
    settingsRow = { employeeId: 'emp-1', defaultStoreId: null };
    storeFindFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      client: {
        userSettings: {
          findUnique: vi.fn().mockImplementation(async () => settingsRow),
          create: vi.fn(),
        },
        store: { findFirst: storeFindFirst },
        organization: { findFirst: vi.fn().mockResolvedValue(null) },
        project: { findFirst: vi.fn().mockResolvedValue(null) },
        counterparty: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };
    svc = new UserSettingsService(prisma as never);
  });

  it('resolves mainStore to the earliest-created active store', async () => {
    storeFindFirst.mockResolvedValue(OLDEST);
    const res = await svc.getForEmployee('emp-1', 'acc-1');
    expect(res.mainStore).toEqual(OLDEST);
    const args = storeFindFirst.mock.calls.at(-1)?.[0];
    expect(args.where).toMatchObject({ accountId: 'acc-1', archived: false });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('keeps defaultStore null when the user has not chosen one (no silent guess)', async () => {
    storeFindFirst.mockResolvedValue(OLDEST);
    const res = await svc.getForEmployee('emp-1', 'acc-1');
    expect(res.defaultStore).toBeNull();
    expect(res.defaultStoreId).toBeNull();
  });

  it('returns mainStore null for an account with no active store', async () => {
    storeFindFirst.mockResolvedValue(null);
    const res = await svc.getForEmployee('emp-1', 'acc-1');
    expect(res.mainStore).toBeNull();
  });
});
