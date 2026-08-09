/**
 * MK26 — `PermissionsService` ga xodim override qatlamini ulash (TZ §3.1).
 *
 * Bu fayl ikki narsani qulflaydi:
 *
 *  1. **REGRESSIYA**: override qatori YO'Q bo'lganda amaldagi ruxsat bugungi
 *     bilan bayt-bayt bir xil qoladi (rol MAX). MK26 ning eng katta xavfi —
 *     ishlab turgan tizimga qatlam qo'shib, jimgina xulqni siljitish.
 *  2. **YANGI XULQ**: override rol natijasini ko'taradi HAM, tushiradi HAM va
 *     u BIR SO'ROVDA yuklanadi (`getCachedOrLoad` ichida) — har ruxsat
 *     tekshiruviga ikkinchi DB murojaati qo'shilmasin.
 */
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from './permissions.service.js';
import type { PermissionScope } from './permissions.types.js';

const EMP = 'emp-1';

interface OverrideStub {
  entity: string;
  action: string;
  scope: PermissionScope;
}

function makeService(opts: {
  roleScopes?: Array<{ entity: string; action: string; scope: PermissionScope }>;
  overrides?: OverrideStub[];
}) {
  const employee = {
    findUnique: vi.fn(async () => ({
      id: EMP,
      groupId: null,
      roles: [
        {
          role: {
            name: 'Savdo menejeri',
            permissions: opts.roleScopes ?? [{ entity: 'demand', action: 'view', scope: 'ALL' }],
          },
        },
      ],
      permissionOverrides: opts.overrides ?? [],
    })),
  };
  const prisma = { client: { employee, account: { findUnique: vi.fn(async () => null) } } };
  // biome-ignore lint/suspicious/noExplicitAny: minimal Prisma stub for a unit test
  return { svc: new PermissionsService(prisma as any), employee };
}

describe("MK26 — override YO'Q: bugungi xulq o'zgarmaydi (regressiya qulfi)", () => {
  it('rol qatlami MAX(scope) ishlaydi', async () => {
    const { svc } = makeService({
      roleScopes: [
        { entity: 'demand', action: 'view', scope: 'OWN' },
        { entity: 'demand', action: 'view', scope: 'ALL' },
      ],
    });
    expect(await svc.resolveScope(EMP, 'demand', 'view')).toBe('ALL');
  });

  it('rol bermagan uch-lik NO qaytaradi', async () => {
    const { svc } = makeService({});
    expect(await svc.resolveScope(EMP, 'payroll', 'delete')).toBe('NO');
  });
});

describe("MK26 §3.1 — override qatlami g'olib", () => {
  it("KO'TARADI: rol OWN → override ALL", async () => {
    const { svc } = makeService({
      roleScopes: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
      overrides: [{ entity: 'demand', action: 'view', scope: 'ALL' }],
    });
    expect(await svc.resolveScope(EMP, 'demand', 'view')).toBe('ALL');
  });

  it('TUSHIRADI: rol ALL → override OWN', async () => {
    const { svc } = makeService({
      roleScopes: [{ entity: 'demand', action: 'view', scope: 'ALL' }],
      overrides: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    expect(await svc.resolveScope(EMP, 'demand', 'view')).toBe('OWN');
  });

  it('override `NO` — Administrator ALL bergan joyda ham TAQIQ', async () => {
    const { svc } = makeService({
      roleScopes: [{ entity: 'debt', action: 'update', scope: 'ALL' }],
      overrides: [{ entity: 'debt', action: 'update', scope: 'NO' }],
    });
    expect(await svc.resolveScope(EMP, 'debt', 'update')).toBe('NO');
  });

  it("override faqat O'Z uch-ligiga ta'sir qiladi, qo'shnisiga emas", async () => {
    const { svc } = makeService({
      roleScopes: [
        { entity: 'demand', action: 'view', scope: 'ALL' },
        { entity: 'demand', action: 'update', scope: 'ALL' },
      ],
      overrides: [{ entity: 'demand', action: 'update', scope: 'NO' }],
    });
    expect(await svc.resolveScope(EMP, 'demand', 'view')).toBe('ALL');
    expect(await svc.resolveScope(EMP, 'demand', 'update')).toBe('NO');
  });

  it("override BIR SO'ROVDA yuklanadi — ikkinchi DB murojaati yo'q", async () => {
    const { svc, employee } = makeService({
      overrides: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    await svc.resolveScope(EMP, 'demand', 'view');
    await svc.resolveScope(EMP, 'demand', 'update');
    expect(employee.findUnique).toHaveBeenCalledTimes(1);
  });

  it("`invalidate()` dan keyin override qayta o'qiladi", async () => {
    const { svc, employee } = makeService({
      overrides: [{ entity: 'demand', action: 'view', scope: 'OWN' }],
    });
    await svc.resolveScope(EMP, 'demand', 'view');
    svc.invalidate(EMP);
    await svc.resolveScope(EMP, 'demand', 'view');
    expect(employee.findUnique).toHaveBeenCalledTimes(2);
  });
});
