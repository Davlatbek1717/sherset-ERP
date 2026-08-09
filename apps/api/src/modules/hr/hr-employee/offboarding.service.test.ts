import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFBOARDING_ITEM } from './offboarding.js';
import { OffboardingService } from './offboarding.service.js';

/**
 * AUTH-05 — xodim bo'shatilganda faol sessiyalar PROAKTIV bekor qilinmasdi:
 * `tokens.revokeAllForEmployee` kodda bor edi-yu, HECH QAYERDAN chaqirilmasdi.
 * Arxivlash faqat keyingi `refresh`da tekshiriladi ⇒ amaldagi access-JWT
 * 15 daqiqagacha kuchda qolardi va DB'dagi refresh tokenlari `revokedAt=null`
 * bo'lib turardi. Ustiga HrEmployeePermission qatorlari bo'shatish
 * ro'yxatida umuman ko'rilmaydi (faqat `hrRoles` sanaladi).
 */
function makeDeps() {
  const tx = {
    employee: { update: vi.fn() },
    employeeOffboarding: { update: vi.fn() },
    hrEmployeePermission: { deleteMany: vi.fn() },
  };
  const prisma = {
    client: {
      employee: { findFirst: vi.fn(), update: vi.fn() },
      employeeOffboarding: { findFirst: vi.fn(), update: vi.fn() },
      cashierSession: { count: vi.fn() },
      employeeDailyKpi: { count: vi.fn() },
      // MK05 — jihoz reyestri: ochiq biriktirishlar soni `auto` bandni yopadi.
      equipmentAssignment: { count: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : arg,
      ),
    },
  };
  const tokens = { revokeAllForEmployee: vi.fn() };
  const permissions = { invalidate: vi.fn() };
  return { prisma, tokens, permissions, tx };
}

describe('OffboardingService.complete — sessiya va ruxsat uzilishi (AUTH-05)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: OffboardingService;

  beforeEach(() => {
    deps = makeDeps();
    service = new OffboardingService(
      deps.prisma as never,
      deps.tokens as never,
      deps.permissions as never,
    );
    // Barcha avtomatik bandlar yopiq: telegram uzilgan, smena yo'q, KPI kuni yo'q, rol yo'q.
    deps.prisma.client.employee.findFirst.mockResolvedValue({
      telegramChatId: null,
      hrRoles: [],
    } as never);
    deps.prisma.client.cashierSession.count.mockResolvedValue(0 as never);
    deps.prisma.client.employeeDailyKpi.count.mockResolvedValue(0 as never);
    // Qaytarilmagan jihoz yo'q — MK05 dan keyin bu AUTO band.
    deps.prisma.client.equipmentAssignment.count.mockResolvedValue(0 as never);
    deps.prisma.client.employeeOffboarding.findFirst.mockResolvedValue({
      id: 'ob1',
      completedAt: null,
      items: {
        [OFFBOARDING_ITEM.cashHandedOver]: { doneAt: '2026-08-09T00:00:00.000Z', byId: 'm1' },
      },
    } as never);
  });

  it('yakunlash refresh-tokenlarni O`SHA tranzaksiyada bekor qiladi', async () => {
    await service.complete('acc1', 'e1');
    expect(deps.tokens.revokeAllForEmployee).toHaveBeenCalledWith('e1', deps.tx);
  });

  it('yakunlash HR-ruxsat qatorlarini va hrRoles`ni tozalaydi', async () => {
    await service.complete('acc1', 'e1');
    expect(deps.tx.hrEmployeePermission.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', employeeId: 'e1' },
    });
    const upd = deps.tx.employee.update.mock.calls[0]?.[0] as {
      data: { archived: boolean; hrRoles: string[] };
    };
    expect(upd.data.archived).toBe(true);
    expect(upd.data.hrRoles).toEqual([]);
  });

  it('yakunlangach ruxsat keshi tozalanadi', async () => {
    await service.complete('acc1', 'e1');
    expect(deps.permissions.invalidate).toHaveBeenCalledWith('e1');
  });

  it('QAYTARILMAGAN JIHOZ bo`lsa yakunlanmaydi va arxivlanmaydi (MK05)', async () => {
    // Reyestrdagi ochiq biriktirish — bo'shatishning BLOKLOVCHI bandi.
    // Ilgari bu band qo'lda tasdiq edi, ya'ni ketayotgan odamdagi telefon
    // «topshirildi» deb belgilanib, tizim uni umuman ko'rmasdi.
    deps.prisma.client.equipmentAssignment.count.mockResolvedValue(2 as never);
    await expect(service.complete('acc1', 'e1')).rejects.toThrow(/jihoz/i);
    expect(deps.tx.employee.update).not.toHaveBeenCalled();
    expect(deps.tokens.revokeAllForEmployee).not.toHaveBeenCalled();
  });

  it('allaqachon yakunlangan bo`lsa qayta revoke qilmaydi (idempotent)', async () => {
    deps.prisma.client.employeeOffboarding.findFirst.mockResolvedValue({
      id: 'ob1',
      completedAt: new Date('2026-08-01'),
      items: {},
    } as never);
    await service.complete('acc1', 'e1');
    expect(deps.tokens.revokeAllForEmployee).not.toHaveBeenCalled();
  });
});
