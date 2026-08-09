/**
 * MK26 — xodim ruxsat override qatlamining I/O servisi.
 *
 * TZ: docs/superpowers/specs/2026-08-01-menejer-tz-design.md §3.1, §3.3.
 *
 * Qaror mantiqi `employee-permission.ts` da (sof, DB'siz testlangan); bu yerda
 * faqat o'qish/yozish + uchta qo'riqchi:
 *   G1 — imtiyoz oshirish taqiqi (server tomonda, ATOMIK rad etish)
 *   G2 — «nega bu ruxsat bor?» (manba: rol / individual)
 *   G3 — har o'zgarish `audit_log` ga eski→yangi bilan
 */
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type PermissionExplanation,
  type RoleGrant,
  checkGrantAllowed,
  explainPermission,
  resolveEffective,
} from './employee-permission.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';
import { OWNER_ROLE_NAME } from './roles.service.js';

/**
 * Bitta katakchani o'rnatish.
 *
 * ⚠️ `scope: null` va `scope: 'NO'` — IKKI XIL amal:
 *   - `null`  → override qatorini O'CHIRADI, xodim rol qatlamiga qaytadi
 *   - `'NO'`  → ATAYLAB TAQIQ yozadi (rol ALL bersa ham yopiq qoladi)
 * Ikkalasi bir xil deb qaralsa «cheklashni bekor qilish» bilan «cheklash»
 * aralashib ketardi.
 */
export interface OverrideCellInput {
  entity: PermissionEntity;
  action: PermissionAction;
  scope: PermissionScope | null;
  note?: string | null;
}

export interface SetOverridesResult {
  changed: number;
  removed: number;
}

@Injectable()
export class EmployeePermissionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  /**
   * G2 — xodim kartasining «nega bu ruxsat bor?» ro'yxati. Har qator uchun
   * amaldagi scope + manbasi (qaysi rol / individual, kim va qachon berdi).
   */
  async explain(
    accountId: string,
    employeeId: string,
    cells: Array<{ entity: PermissionEntity; action: PermissionAction }>,
  ): Promise<PermissionExplanation[]> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        id: true,
        roles: {
          select: {
            role: { select: { name: true, permissions: true } },
          },
        },
        permissionOverrides: {
          select: {
            entity: true,
            action: true,
            scope: true,
            grantedAt: true,
            grantedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');

    const overrideByKey = new Map(
      employee.permissionOverrides.map((o) => [
        `${o.entity}.${o.action}`,
        {
          scope: o.scope as PermissionScope,
          grantedAt: o.grantedAt.toISOString(),
          grantedByName: o.grantedBy
            ? `${o.grantedBy.lastName ?? ''} ${o.grantedBy.firstName ?? ''}`.trim() || null
            : null,
        },
      ]),
    );

    return cells.map(({ entity, action }) => {
      const grants: RoleGrant[] = [];
      for (const er of employee.roles) {
        for (const p of er.role.permissions) {
          if (p.entity === entity && p.action === action) {
            grants.push({ roleName: er.role.name, scope: p.scope as PermissionScope });
          }
        }
      }
      const eff = resolveEffective(grants, overrideByKey.get(`${entity}.${action}`) ?? null);
      return explainPermission(entity, action, eff);
    });
  }

  /**
   * Override katakchalarini o'rnatish. G1 buzilsa **hech nima yozilmaydi** —
   * rad etish atomik, «yarmi o'tdi» holati bo'lmaydi (MK27 dagi fail-closed
   * migratsiya bilan bir xil intizom).
   */
  async setOverrides(
    accountId: string,
    actorEmployeeId: string,
    employeeId: string,
    cells: OverrideCellInput[],
  ): Promise<SetOverridesResult> {
    // Tenant qo'riqchisi — boshqa akkaunt xodimi «yo'q» deb ko'rsatiladi
    // (403 emas 404: mavjudlik sizib chiqmasin).
    const target = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Xodim topilmadi');

    const actorIsOwner = await this.isOwner(actorEmployeeId);

    // ── G1 — hammasini OLDIN tekshir, keyin yoz ──────────────────────────────
    const refusals: string[] = [];
    for (const c of cells) {
      if (c.scope === null) continue; // override olib tashlash — G1 talab qilmaydi
      const actorScope = await this.permissions.resolveScope(actorEmployeeId, c.entity, c.action);
      const verdict = checkGrantAllowed({
        actorScope,
        requestedScope: c.scope,
        actorIsOwner,
      });
      if (!verdict.allowed) {
        refusals.push(
          `${c.entity}.${c.action} → ${c.scope} (sizda: ${actorScope}, sabab: ${verdict.reason})`,
        );
      }
    }
    if (refusals.length > 0) {
      throw new ForbiddenException(
        `Imtiyoz oshirish taqiqi (G1) — quyidagilar rad etildi: ${refusals.join(' · ')}`,
      );
    }

    // ── Joriy holat (eski→yangi farqi va audit uchun) ────────────────────────
    const existing = await this.prisma.client.employeePermission.findMany({
      where: { employeeId, accountId },
      select: { entity: true, action: true, scope: true },
    });
    const currentByKey = new Map(existing.map((e) => [`${e.entity}.${e.action}`, e.scope]));

    const fieldChanges: Record<string, { before: string | null; after: string | null }> = {};
    const toUpsert: OverrideCellInput[] = [];
    const toDelete: OverrideCellInput[] = [];

    for (const c of cells) {
      const key = `${c.entity}.${c.action}`;
      const before = currentByKey.get(key) ?? null;
      const after = c.scope;
      if (before === after) continue; // o'zgarmagan katakcha — audit ifloslanmaydi
      fieldChanges[key] = { before, after };
      if (after === null) toDelete.push(c);
      else toUpsert.push(c);
    }

    if (Object.keys(fieldChanges).length === 0) return { changed: 0, removed: 0 };

    await this.prisma.client.$transaction(async (tx) => {
      for (const c of toUpsert) {
        await tx.employeePermission.upsert({
          where: {
            employeeId_entity_action: {
              employeeId,
              entity: c.entity,
              action: c.action,
            },
          },
          create: {
            accountId,
            employeeId,
            entity: c.entity,
            action: c.action,
            // biome-ignore lint/style/noNonNullAssertion: toUpsert faqat null-bo'lmagan scope'lardan yig'iladi
            scope: c.scope!,
            grantedById: actorEmployeeId,
            note: c.note ?? null,
          },
          update: {
            // biome-ignore lint/style/noNonNullAssertion: yuqoridagi bilan bir xil
            scope: c.scope!,
            grantedById: actorEmployeeId,
            grantedAt: new Date(),
            note: c.note ?? null,
          },
        });
      }
      for (const c of toDelete) {
        await tx.employeePermission.deleteMany({
          where: { employeeId, entity: c.entity, action: c.action },
        });
      }
      // G3 — bitta so'rovdagi barcha o'zgarishlar BITTA audit yozuvida
      // (`fieldChanges` = { 'entity.action': { before, after } }).
      await tx.auditLog.create({
        data: {
          accountId,
          userId: actorEmployeeId,
          entity: 'employeepermission',
          entityId: employeeId,
          action: 'permission-override',
          fieldChanges,
        },
      });
    });

    // Cache 5 daqiqa TTL bilan ishlaydi — tozalanmasa yangi ruxsat darhol
    // kuchga kirmasdi (yoki tushirilgan ruxsat 5 daqiqa ochiq qolardi).
    this.permissions.invalidate(employeeId);

    return { changed: toUpsert.length, removed: toDelete.length };
  }

  /** Egasi (`AccountOwner`) G1 dan ozod — TZ §3.3 dagi yagona istisno. */
  private async isOwner(employeeId: string): Promise<boolean> {
    const emp = await this.prisma.client.employee.findUnique({
      where: { id: employeeId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    return (emp?.roles ?? []).some((r) => r.role.name === OWNER_ROLE_NAME);
  }
}
