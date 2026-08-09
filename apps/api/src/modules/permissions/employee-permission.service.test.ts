/**
 * MK26 — `EmployeePermissionService`: G1 (imtiyoz oshirish taqiqi) + G3 (audit)
 * + G2 o'qish yo'li. TZ §3.3.
 *
 * Sof qaror mantiqi `employee-permission.ts` da va u yerda alohida testlangan;
 * bu fayl **I/O shartnomasini** qulflaydi:
 *   - G1 buzilganda **HECH NIMA yozilmaydi** (atomik rad etish, yarim qo'llash yo'q)
 *   - `scope: null` ≠ `scope: 'NO'` — birinchisi override'ni O'CHIRADI (rol
 *     qatlamiga qaytaradi), ikkinchisi ATAYLAB TAQIQ yozadi
 *   - har o'zgarish audit'ga eski→yangi bilan tushadi (G3)
 *   - yozgandan keyin ruxsat cache'i tozalanadi (aks holda 5 daqiqa eski
 *     ruxsat bilan ishlardi)
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EmployeePermissionService } from './employee-permission.service.js';
import type { PermissionScope } from './permissions.types.js';

const ACC = 'acc-1';
const ACTOR = 'actor-1';
const TARGET = 'target-1';

function makeService(opts: {
  /** Aktorning amaldagi scope'i (G1 uchun). */
  actorScope?: PermissionScope;
  actorIsOwner?: boolean;
  /** Nishon xodimda allaqachon turgan override qatorlari. */
  existing?: Array<{ entity: string; action: string; scope: PermissionScope }>;
  targetMissing?: boolean;
}) {
  const existing = opts.existing ?? [];

  const employeePermission = {
    findMany: vi.fn(async () => existing),
    upsert: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  const auditLog = { create: vi.fn(async () => ({})) };
  const employee = {
    findFirst: vi.fn(async () =>
      opts.targetMissing ? null : { id: TARGET, accountId: ACC, firstName: 'A', lastName: 'B' },
    ),
    findUnique: vi.fn(async () => ({
      id: ACTOR,
      roles: opts.actorIsOwner
        ? [{ role: { name: 'AccountOwner' } }]
        : [{ role: { name: 'Manager' } }],
    })),
  };

  const tx = { employeePermission, auditLog };
  const prisma = {
    client: {
      employee,
      employeePermission,
      auditLog,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };

  const permissions = {
    resolveScope: vi.fn(async () => opts.actorScope ?? 'ALL'),
    invalidate: vi.fn(),
  };

  const svc = new EmployeePermissionService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal Prisma stub
    prisma as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal PermissionsService stub
    permissions as any,
  );
  return { svc, employeePermission, auditLog, permissions, employee };
}

describe('MK26 G1 — imtiyoz oshirish taqiqi (server tomonda)', () => {
  it("aktorda YO'Q ruxsatni berishga urinish → 403", async () => {
    const { svc } = makeService({ actorScope: 'NO' });
    await expect(
      svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: 'OWN' }]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aktordan YUQORI scope tayinlashga urinish → 403', async () => {
    const { svc } = makeService({ actorScope: 'OWN' });
    await expect(
      svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: 'ALL' }]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("G1 rad etsa — HECH NIMA yozilmaydi (yarim qo'llash yo'q)", async () => {
    // Ikki katakcha: birinchisi qonuniy, ikkinchisi G1 ni buzadi. Butun
    // so'rov rad etilishi kerak, aks holda admin «yarmi o'tdi» holatini
    // ko'rmay qolardi.
    const { svc, employeePermission, auditLog } = makeService({ actorScope: 'OWN' });
    await expect(
      svc.setOverrides(ACC, ACTOR, TARGET, [
        { entity: 'demand', action: 'view', scope: 'OWN' },
        { entity: 'debt', action: 'update', scope: 'ALL' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employeePermission.upsert).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it('403 xabari QAYSI katakcha buzganini aytadi', async () => {
    const { svc } = makeService({ actorScope: 'OWN' });
    await expect(
      svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'debt', action: 'update', scope: 'ALL' }]),
    ).rejects.toThrow(/debt.*update/);
  });

  it("ruxsatni TUSHIRISH aktorda ruxsat bo'lmasa ham mumkin", async () => {
    const { svc, employeePermission } = makeService({ actorScope: 'NO' });
    await svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: 'NO' }]);
    expect(employeePermission.upsert).toHaveBeenCalledTimes(1);
  });

  it('egasi (AccountOwner) G1 dan ozod', async () => {
    const { svc, employeePermission } = makeService({ actorScope: 'NO', actorIsOwner: true });
    await svc.setOverrides(ACC, ACTOR, TARGET, [
      { entity: 'demand', action: 'view', scope: 'ALL' },
    ]);
    expect(employeePermission.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("MK26 — `null` ≠ `NO` (override o'chirish vs ataylab taqiq)", () => {
  it("`scope: null` override qatorini O'CHIRADI (rol qatlamiga qaytaradi)", async () => {
    const { svc, employeePermission } = makeService({
      existing: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    await svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: null }]);
    expect(employeePermission.deleteMany).toHaveBeenCalledTimes(1);
    expect(employeePermission.upsert).not.toHaveBeenCalled();
  });

  it("`scope: 'NO'` qator YOZADI — bu ataylab taqiq, o'chirish emas", async () => {
    const { svc, employeePermission } = makeService({});
    await svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: 'NO' }]);
    expect(employeePermission.upsert).toHaveBeenCalledTimes(1);
    expect(employeePermission.deleteMany).not.toHaveBeenCalled();
  });

  it("mavjud bo'lmagan override'ni o'chirish — jim no-op, xato emas", async () => {
    const { svc, auditLog } = makeService({ existing: [] });
    await svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: null }]);
    // O'zgarish bo'lmagani uchun audit yozuvi ham yo'q.
    expect(auditLog.create).not.toHaveBeenCalled();
  });
});

describe('MK26 G3 — audit', () => {
  it("har o'zgarish eski→yangi bilan audit'ga tushadi", async () => {
    const { svc, auditLog } = makeService({
      existing: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    await svc.setOverrides(ACC, ACTOR, TARGET, [
      { entity: 'demand', action: 'view', scope: 'ALL' },
    ]);
    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const arg = auditLog.create.mock.calls[0][0] as {
      data: {
        accountId: string;
        userId: string;
        entityId: string;
        action: string;
        fieldChanges: unknown;
      };
    };
    expect(arg.data.accountId).toBe(ACC);
    expect(arg.data.userId).toBe(ACTOR);
    // entityId = KIMGA tegishli (audit_log.entity_id UUID) — nishon xodim.
    expect(arg.data.entityId).toBe(TARGET);
    expect(arg.data.fieldChanges).toEqual({
      'demand.view': { before: 'OWN', after: 'ALL' },
    });
  });

  it("o'zgarmagan katakcha audit'ni ifloslantirmaydi", async () => {
    const { svc, auditLog, employeePermission } = makeService({
      existing: [{ entity: 'demand', action: 'view', scope: 'ALL' }],
    });
    await svc.setOverrides(ACC, ACTOR, TARGET, [
      { entity: 'demand', action: 'view', scope: 'ALL' },
    ]);
    expect(auditLog.create).not.toHaveBeenCalled();
    expect(employeePermission.upsert).not.toHaveBeenCalled();
  });

  it("override o'chirilganda `after: null` yoziladi (rol qatlamiga qaytdi)", async () => {
    const { svc, auditLog } = makeService({
      existing: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    await svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: null }]);
    const arg = auditLog.create.mock.calls[0][0] as { data: { fieldChanges: unknown } };
    expect(arg.data.fieldChanges).toEqual({
      'demand.view': { before: 'OWN', after: null },
    });
  });
});

describe("MK26 — cache va tenant qo'riqchilari", () => {
  it("yozgandan keyin nishon xodim cache'i tozalanadi", async () => {
    const { svc, permissions } = makeService({});
    await svc.setOverrides(ACC, ACTOR, TARGET, [
      { entity: 'demand', action: 'view', scope: 'ALL' },
    ]);
    expect(permissions.invalidate).toHaveBeenCalledWith(TARGET);
  });

  it('boshqa akkaunt xodimiga yozishga urinish → 404 (mavjudlik sizib chiqmaydi)', async () => {
    const { svc } = makeService({ targetMissing: true });
    await expect(
      svc.setOverrides(ACC, ACTOR, TARGET, [{ entity: 'demand', action: 'view', scope: 'ALL' }]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
