/**
 * MK26 G1 — ROL yozish yo'lidagi imtiyoz oshirish taqiqi (TZ §3.3).
 *
 * TZ aynan shu hujumni nomlab ko'rsatadi:
 *
 *   «Aks holda bir marta `role:update` ruxsatini olgan xodim o'zini adminga
 *    aylantiradi.»
 *
 * Ya'ni G1 ni faqat xodim-override yo'liga qo'yish YETARLI EMAS: rol matritsasi
 * ham ruxsat beruvchi yo'l. Menejer `role:update` bilan yangi rol yaratib unga
 * `ALL` yozsa va o'ziga biriktirsa — override qatlamiga umuman tegmasdan
 * admin bo'lib oladi.
 *
 * `AccountOwner` bu tekshiruvdan ozod (u allaqachon hamma narsaga ega).
 */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from './permissions.types.js';
import { RolesService } from './roles.service.js';

const ACC = 'acc-1';
const ACTOR = 'actor-1';
const ROLE = '11111111-1111-1111-1111-111111111111';

function makeService(opts: { actorScope: PermissionScope; actorIsOwner?: boolean }) {
  const role = {
    create: vi.fn(async () => ({ id: ROLE })),
    findFirst: vi.fn(async () => ({ id: ROLE, isSystem: false })),
    update: vi.fn(async () => ({})),
  };
  const rolePermission = {
    deleteMany: vi.fn(async () => ({})),
    createMany: vi.fn(async () => ({})),
  };
  const employee = {
    findUnique: vi.fn(async () => ({
      roles: opts.actorIsOwner
        ? [{ role: { name: 'AccountOwner' } }]
        : [{ role: { name: 'Manager' } }],
    })),
  };
  const prisma = {
    client: {
      role,
      rolePermission,
      employee,
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) =>
        fn({ role, rolePermission }),
      ),
    },
  };
  const permissions = { resolveScope: vi.fn(async () => opts.actorScope), invalidate: vi.fn() };
  // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for a unit test
  const svc = new RolesService(prisma as any, permissions as any);
  return { svc, role, rolePermission };
}

describe("MK26 G1 — rol YARATISHDA imtiyoz oshirish to'siladi", () => {
  it("aktor OWN bo'lsa, rolga ALL yoza olmaydi → 403", async () => {
    const { svc, role } = makeService({ actorScope: 'OWN' });
    await expect(
      svc.create(
        ACC,
        { name: 'Yangi rol', permissions: [{ entity: 'demand', action: 'view', scope: 'ALL' }] },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(role.create).not.toHaveBeenCalled();
  });

  it("aktorda umuman ruxsat bo'lmasa (NO) hech narsa bera olmaydi → 403", async () => {
    const { svc } = makeService({ actorScope: 'NO' });
    await expect(
      svc.create(
        ACC,
        { name: 'Yangi rol', permissions: [{ entity: 'debt', action: 'update', scope: 'OWN' }] },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("o'zidagi darajagacha berish MUMKIN", async () => {
    const { svc, role } = makeService({ actorScope: 'ALL' });
    await svc
      .create(
        ACC,
        { name: 'Yangi rol', permissions: [{ entity: 'demand', action: 'view', scope: 'ALL' }] },
        ACTOR,
      )
      .catch(() => undefined); // findOne stub'i yo'q — yozish urinishini tekshiramiz
    expect(role.create).toHaveBeenCalledTimes(1);
  });

  it('egasi tekshiruvdan ozod', async () => {
    const { svc, role } = makeService({ actorScope: 'NO', actorIsOwner: true });
    await svc
      .create(
        ACC,
        { name: 'Yangi rol', permissions: [{ entity: 'demand', action: 'view', scope: 'ALL' }] },
        ACTOR,
      )
      .catch(() => undefined);
    expect(role.create).toHaveBeenCalledTimes(1);
  });
});

describe("MK26 G1 — rol TAHRIRLASHDA imtiyoz oshirish to'siladi", () => {
  it("matritsani ALL ga ko'tarishga urinish → 403 va matritsa TEGILMAYDI", async () => {
    const { svc, rolePermission } = makeService({ actorScope: 'OWN_GROUP' });
    await expect(
      svc.update(
        ACC,
        ROLE,
        {
          version: 0,
          permissions: [{ entity: 'demand', action: 'view', scope: 'ALL' }],
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it("matritsaga TEGMAYDIGAN tahrir (faqat nom) G1 tekshiruvidan o'tadi", async () => {
    // Nomni o'zgartirish imtiyoz bermaydi — bloklansa oddiy tahrir buzilardi.
    const { svc, rolePermission } = makeService({ actorScope: 'NO' });
    await svc.update(ACC, ROLE, { version: 0, name: 'Boshqa nom' }, ACTOR).catch(() => undefined);
    expect(rolePermission.deleteMany).not.toHaveBeenCalled();
  });
});
