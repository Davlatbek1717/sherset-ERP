/**
 * MK29 — shablonni ROLGA qo'llash (`RolesService.applyTemplate`).
 *
 * Bu fayl QAROR-B4.3 shartnomasini qulflaydi:
 *
 *   Shablon qo'llash FAQAT rol qatlamini qayta yozadi.
 *   Xodim override'lari (MK26) O'CHIRILMAYDI va g'olib qolaveradi.
 *   Javobda `maskedByOverride[]` — «bu xodimlarda shablondan FARQ qiluvchi
 *   individual tuzatish bor» ro'yxati qaytadi.
 *
 * Nega ro'yxat majburiy: aks holda admin «rolni standartga qaytardim» deb
 * o'ylardi, amalda esa Azizda qo'lda berilgan ortiqcha ruxsat qolib ketardi.
 * Bu — jim ruxsat kengayishi, ya'ni xavfsizlik nuqsoni.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from './permissions.types.js';
import { resolveTemplateMatrix } from './role-templates.js';
import { RolesService } from './roles.service.js';

const ACC = 'acc-1';
const ROLE = 'role-1';
const ACTOR = 'actor-1';

type OverrideRow = {
  employeeId: string;
  entity: string;
  action: string;
  scope: PermissionScope;
  employee: { firstName: string | null; lastName: string | null };
};

function makeService(
  opts: {
    roleMissing?: boolean;
    /** Aktorning amaldagi scope'i (G1). */
    actorScope?: PermissionScope;
    actorIsOwner?: boolean;
    /** Shu rolni tutgan xodimlarning override qatorlari. */
    overrides?: OverrideRow[];
    version?: number;
  } = {},
) {
  const rolePermission = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => []),
  };
  const employeePermission = {
    findMany: vi.fn(async () => opts.overrides ?? []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  const role = {
    findFirst: vi.fn(async () =>
      opts.roleMissing
        ? null
        : {
            id: ROLE,
            accountId: ACC,
            name: 'Kassir',
            description: null,
            isSystem: false,
            version: opts.version ?? 1,
            createdAt: new Date('2026-08-10T00:00:00Z'),
            updatedAt: new Date('2026-08-10T00:00:00Z'),
            permissions: [],
            _count: { employees: 1 },
          },
    ),
    update: vi.fn(async () => ({ id: ROLE })),
  };
  const employeeRole = {
    findMany: vi.fn(async () => [{ employeeId: 'emp-1' }]),
  };
  const employee = {
    findUnique: vi.fn(async () => ({
      id: ACTOR,
      roles:
        opts.actorIsOwner === false
          ? [{ role: { name: 'Manager' } }]
          : [{ role: { name: 'AccountOwner' } }],
    })),
  };
  const auditLog = { create: vi.fn(async () => ({})) };

  const tx = { role, rolePermission, auditLog, employeePermission };
  const prisma = {
    client: {
      role,
      rolePermission,
      employeePermission,
      employeeRole,
      employee,
      auditLog,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };
  const permissions = {
    resolveScope: vi.fn(async () => opts.actorScope ?? 'ALL'),
    invalidate: vi.fn(),
  };

  const svc = new RolesService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal Prisma stub
    prisma as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal PermissionsService stub
    permissions as any,
  );
  return { svc, prisma, permissions, role, rolePermission, employeePermission, auditLog };
}

describe('MK29 — applyTemplate: kirish tekshiruvi', () => {
  it('rol topilmasa 404', async () => {
    const { svc } = makeService({ roleMissing: true });
    await expect(svc.applyTemplate(ACC, ROLE, 'cashier', 1, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('noma’lum shablon slug 400 (va hech nima yozilmaydi)', async () => {
    const { svc, rolePermission } = makeService();
    await expect(
      // @ts-expect-error — ataylab noto'g'ri slug
      svc.applyTemplate(ACC, ROLE, 'superuser', 1, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('prototip ifloslanishi slug sifatida qabul qilinmaydi', async () => {
    const { svc } = makeService();
    await expect(
      // @ts-expect-error — ataylab noto'g'ri slug
      svc.applyTemplate(ACC, ROLE, '__proto__', 1, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MK29 — applyTemplate: rol qatlamini to‘liq almashtiradi', () => {
  it('eski matritsa o‘chiriladi va shablonning NO-bo‘lmagan katakchalari yoziladi', async () => {
    const { svc, rolePermission, role } = makeService();
    const res = await svc.applyTemplate(ACC, ROLE, 'cashier', 1, ACTOR);

    expect(rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: ROLE } });

    const written = rolePermission.createMany.mock.calls[0]?.[0]?.data as Array<{
      entity: string;
      action: string;
      scope: string;
    }>;
    const expected = resolveTemplateMatrix('cashier').filter((c) => c.scope !== 'NO');
    expect(written).toHaveLength(expected.length);
    expect(res.applied).toBe(expected.length);
    // `NO` katakcha yozilmaydi — jadval siyrak (mavjud `findOne` shartnomasi).
    expect(written.every((c) => c.scope !== 'NO')).toBe(true);
    // Kassirning o'z ishi ichida.
    expect(written).toContainEqual({
      roleId: ROLE,
      entity: 'retailsale',
      action: 'view',
      scope: 'ALL',
    });
    // Kassirga yopiq bo'lgan narsa umuman yozilmaydi.
    expect(written.some((c) => c.entity === 'payroll')).toBe(false);

    // Provenance + kiosk rejimi shablon bilan birga yoziladi.
    const upd = role.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(upd.data.templateSlug).toBe('cashier');
    expect(upd.data.uiMode).toBe('kiosk');
  });

  it('optimistic lock: version shartga kiradi va oshiriladi', async () => {
    const { svc, role } = makeService({ version: 7 });
    await svc.applyTemplate(ACC, ROLE, 'seller', 7, ACTOR);
    const upd = role.update.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(upd.where).toMatchObject({ id: ROLE, accountId: ACC, version: 7 });
    expect(upd.data.version).toEqual({ increment: 1 });
  });

  it('har o‘zgarish audit jurnaliga tushadi (G3)', async () => {
    const { svc, auditLog } = makeService();
    await svc.applyTemplate(ACC, ROLE, 'storekeeper', 1, ACTOR);
    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const row = auditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(row).toMatchObject({
      accountId: ACC,
      userId: ACTOR,
      entity: 'role',
      action: 'template-apply',
    });
  });

  it('rol a’zolarining ruxsat cache’i tozalanadi', async () => {
    // Aks holda yangi matritsa 5 daqiqagacha kuchga kirmasdi.
    const { svc, permissions } = makeService();
    await svc.applyTemplate(ACC, ROLE, 'driver', 1, ACTOR);
    expect(permissions.invalidate).toHaveBeenCalledWith('emp-1');
  });
});

describe('MK29 — QAROR-B4.3: override O‘CHMAYDI, faqat ko‘rsatiladi', () => {
  const overrides: OverrideRow[] = [
    // Shablondan FARQ qiladi — ro'yxatga tushadi.
    {
      employeeId: 'emp-1',
      entity: 'debtreport',
      action: 'view',
      scope: 'ALL',
      employee: { firstName: 'Aziz', lastName: 'Karimov' },
    },
    // Shablon bilan BIR XIL — ro'yxatni ifloslantirmaydi.
    {
      employeeId: 'emp-1',
      entity: 'retailsale',
      action: 'view',
      scope: 'ALL',
      employee: { firstName: 'Aziz', lastName: 'Karimov' },
    },
  ];

  it('employeePermission jadvaliga YOZILMAYDI (o‘chirish ham yo‘q)', async () => {
    const { svc, employeePermission } = makeService({ overrides });
    await svc.applyTemplate(ACC, ROLE, 'cashier', 1, ACTOR);
    expect(employeePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('faqat FARQ qiluvchi override ro‘yxatga tushadi', async () => {
    const { svc } = makeService({ overrides });
    const res = await svc.applyTemplate(ACC, ROLE, 'cashier', 1, ACTOR);

    expect(res.maskedByOverride).toEqual([
      {
        employeeId: 'emp-1',
        employeeName: 'Karimov Aziz',
        entity: 'debtreport',
        action: 'view',
        // Kassir shabloni `debtreport` ni yopadi, override esa ochib turibdi —
        // aynan shu «standartga qaytardim» illyuziyasi.
        templateScope: 'NO',
        overrideScope: 'ALL',
      },
    ]);
  });

  it('override bo‘lmasa ro‘yxat bo‘sh', async () => {
    const { svc } = makeService({ overrides: [] });
    const res = await svc.applyTemplate(ACC, ROLE, 'cashier', 1, ACTOR);
    expect(res.maskedByOverride).toEqual([]);
  });
});

describe('MK29 — applyTemplate G1 (imtiyoz oshirish taqiqi)', () => {
  it('o‘zida yo‘q scope’ni shablon orqali ham yoza olmaydi', async () => {
    // Hujum: `role:update` olgan menejer «Admin» shablonini bosib o'ziga
    // to'liq kirish yozadi. G1 uni MK26 dagi qo'lda tahrir yo'li bilan bir
    // xil to'xtatishi shart — aks holda shablon tugmasi teshik bo'lardi.
    const { svc, rolePermission } = makeService({ actorScope: 'OWN', actorIsOwner: false });
    await expect(svc.applyTemplate(ACC, ROLE, 'admin', 1, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Atomik rad etish — yarim qo'llash yo'q.
    expect(rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('egasi (AccountOwner) G1 dan ozod', async () => {
    const { svc, rolePermission } = makeService({ actorScope: 'NO', actorIsOwner: true });
    await expect(svc.applyTemplate(ACC, ROLE, 'admin', 1, ACTOR)).resolves.toBeTruthy();
    expect(rolePermission.createMany).toHaveBeenCalled();
  });
});
