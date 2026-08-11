import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { checkGrantAllowed } from './employee-permission.js';
import { PermissionsService } from './permissions.service.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';
import {
  ROLE_TEMPLATES,
  type RoleTemplateSlug,
  type TemplateCell,
  isRoleTemplateSlug,
  resolveTemplateMatrix,
} from './role-templates.js';
import {
  CreateRoleSchema,
  type RolePermissionCellInput,
  UpdateRoleSchema,
} from './roles.schema.js';

/**
 * DB names of the two lazily-created system roles behind the moysklad
 * employee-card «Системные роли» radios. English like the seeded four
 * (Administrator/Manager/Employee/ReadOnly); the web app maps them to the
 * moysklad labels («Владелец аккаунта», «Доступ только к точкам продаж»).
 */
export const OWNER_ROLE_NAME = 'AccountOwner';
export const POS_ROLE_NAME = 'PointOfSale';
/** Cheksiz kirishga ega rollar — «o'zingda yo'q narsani bera olmaysan» tekshiruvi shularga tayanadi. */
export const ADMINISH_ROLE_NAMES: readonly string[] = [OWNER_ROLE_NAME, 'Administrator'];

export interface RoleListRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetail extends RoleListRow {
  /** Optimistic-lock token the edit form echoes back on Save (moysklad parity). */
  version: number;
  /** Sparse map: only cells with scope !== 'NO'. UI fills the rest. */
  permissions: Array<{
    entity: string;
    action: string;
    scope: PermissionScope;
  }>;
}

/**
 * MK29 — shablon qo'llangandan KEYIN ham kuchda qoladigan individual
 * tuzatish (QAROR-B4.3). `templateScope` — shablon nima deyapti,
 * `overrideScope` — amalda nima kuchda.
 */
export interface MaskedOverride {
  employeeId: string;
  employeeName: string;
  entity: string;
  action: PermissionAction;
  templateScope: PermissionScope;
  overrideScope: PermissionScope;
}

export interface ApplyTemplateResult {
  role: RoleDetail;
  slug: RoleTemplateSlug;
  /** Rolga yozilgan (NO-bo'lmagan) katakchalar soni. */
  applied: number;
  maskedByOverride: MaskedOverride[];
}

/**
 * Roles CRUD for the Analitika /sozlamalar/rollar admin page. System roles
 * (Administrator/Manager/Employee/ReadOnly seeded at provisioning) can have
 * their permissions edited but cannot be renamed or deleted — that's a
 * standard RBAC safety rail.
 */
@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  /**
   * MK26 G1 (TZ §3.3) — aktor rol matritsasiga **o'zida yo'q** yoki **o'zidan
   * yuqori** scope yoza olmaydi.
   *
   * Nega bu yerda ham kerak: G1 ni faqat xodim-override yo'liga qo'yish
   * yetarli emas edi. `role:update` olgan menejer yangi rol yaratib unga
   * `ALL` yozsa va o'ziga biriktirsa — override qatlamiga tegmasdan admin
   * bo'lib olardi (TZ shu hujumni nomlab ko'rsatadi).
   *
   * `AccountOwner` ozod: u allaqachon hamma narsaga ega, tekshiruv faqat
   * ortiqcha to'siq bo'lardi.
   */
  private async assertNoEscalation(
    actorEmployeeId: string,
    cells: readonly RolePermissionCellInput[],
  ): Promise<void> {
    if (cells.length === 0) return;

    const actor = await this.prisma.client.employee.findUnique({
      where: { id: actorEmployeeId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const actorIsOwner = (actor?.roles ?? []).some((r) => r.role.name === OWNER_ROLE_NAME);
    if (actorIsOwner) return;

    const refusals: string[] = [];
    for (const c of cells) {
      const actorScope = await this.permissions.resolveScope(
        actorEmployeeId,
        c.entity as PermissionEntity,
        c.action,
      );
      const verdict = checkGrantAllowed({ actorScope, requestedScope: c.scope });
      if (!verdict.allowed) {
        refusals.push(`${c.entity}.${c.action} → ${c.scope} (sizda: ${actorScope})`);
      }
    }
    if (refusals.length > 0) {
      throw new ForbiddenException(
        `Imtiyoz oshirish taqiqi (G1) — o'zingizda yo'q ruxsatni rolga yoza olmaysiz: ${refusals.join(' · ')}`,
      );
    }
  }

  async list(accountId: string): Promise<{ items: RoleListRow[] }> {
    const rows = await this.prisma.client.role.findMany({
      where: { accountId },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { employees: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        memberCount: r._count.employees,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async findOne(accountId: string, id: string): Promise<RoleDetail> {
    const row = await this.prisma.client.role.findFirst({
      where: { id, accountId },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        permissions: { select: { entity: true, action: true, scope: true } },
        _count: { select: { employees: true } },
      },
    });
    if (!row) throw new NotFoundException(`Role ${id} not found`);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      version: row.version,
      memberCount: row._count.employees,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      permissions: row.permissions
        .filter((p) => p.scope !== 'NO')
        .map((p) => ({
          entity: p.entity,
          action: p.action,
          scope: p.scope as PermissionScope,
        })),
    };
  }

  async create(accountId: string, raw: unknown, actorEmployeeId: string): Promise<RoleDetail> {
    const parsed = CreateRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    // G1 — yozishdan OLDIN (rad etilsa hech nima yaratilmaydi).
    await this.assertNoEscalation(actorEmployeeId, parsed.data.permissions);
    try {
      const created = await this.prisma.client.role.create({
        data: {
          accountId,
          name: parsed.data.name,
          description: parsed.data.description,
          isSystem: false,
          permissions: {
            createMany: {
              data: this.normalizePermissions(parsed.data.permissions),
              skipDuplicates: true,
            },
          },
        },
        select: { id: true },
      });
      return this.findOne(accountId, created.id);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(
    accountId: string,
    id: string,
    raw: unknown,
    actorEmployeeId: string,
  ): Promise<RoleDetail> {
    const parsed = UpdateRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    // G1 — faqat matritsa TEGILGANDA. Nom/tavsif tahriri imtiyoz bermaydi,
    // uni bloklash oddiy ishni buzardi.
    if (parsed.data.permissions !== undefined) {
      await this.assertNoEscalation(actorEmployeeId, parsed.data.permissions);
    }
    const existing = await this.prisma.client.role.findFirst({
      where: { id, accountId },
      select: { id: true, isSystem: true },
    });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);

    // System roles: only the permission matrix is editable, not name/description.
    if (
      existing.isSystem &&
      (parsed.data.name !== undefined || parsed.data.description !== undefined)
    ) {
      throw new ForbiddenException("Tizim rollarining nomi yoki tavsifini o'zgartirib bo'lmaydi");
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Optimistic lock: ALWAYS run the versioned header update — even a
        // permissions-only edit must bump the version (and 409 on a stale one),
        // so the full matrix rewrite below is guarded against a concurrent
        // clobber. findFirst above proves existence, so a P2025 from this update
        // is a concurrency conflict; it aborts the tx, rolling back the matrix.
        await tx.role.update({
          where: { id, accountId, version: parsed.data.version },
          data: {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.description !== undefined
              ? { description: parsed.data.description }
              : {}),
            version: { increment: 1 },
          },
        });
        if (parsed.data.permissions !== undefined) {
          // Replace full matrix: delete all + recreate non-NO cells.
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          const next = this.normalizePermissions(parsed.data.permissions);
          if (next.length > 0) {
            await tx.rolePermission.createMany({
              data: next.map((p) => ({ ...p, roleId: id })),
              skipDuplicates: true,
            });
          }
        }
      });
      return this.findOne(accountId, id);
    } catch (e) {
      mapVersionedUpdateError(e, 'Role');
      this.handlePrisma(e);
    }
  }

  /**
   * MK29 — rol shablonini ROLGA qo'llash (TZ §3.4, QAROR-B4.3).
   *
   * ⚠️ SHARTNOMA: bu amal **faqat rol qatlamiga** tegadi. Xodim
   * override'lari (`employee_permissions`, MK26) **o'chirilmaydi** va
   * amaldagi ruxsatda g'olib qolaveradi. Buning o'rniga javobda
   * `maskedByOverride[]` qaytadi — «shu xodimlarda shablondan FARQ qiluvchi
   * individual tuzatish bor» ro'yxati.
   *
   * Nega o'chirmaymiz: `clearOverrides` bayrog'i ko'rib chiqilgan va RAD
   * ETILGAN (QAROR-B4.3) — tasodifiy bosishda ruxsat jimgina kengayardi va
   * buni faqat audit jurnalidan keyin bilib olinardi. Nega ro'yxat majburiy:
   * aks holda admin «standartga qaytardim» deb o'ylardi, amalda esa qo'lda
   * berilgan ortiqcha ruxsat qolib ketardi.
   *
   * G1 (MK26) shu yerda ham ishlaydi: aks holda `role:update` olgan menejer
   * «Admin» shablonini bosib o'ziga to'liq kirish yozardi — qo'lda tahrir
   * yo'li yopiq bo'lsa-yu, shablon tugmasi ochiq qolsa, qulf bezakka
   * aylanardi.
   */
  async applyTemplate(
    accountId: string,
    roleId: string,
    slug: RoleTemplateSlug,
    version: number,
    actorEmployeeId: string,
  ): Promise<ApplyTemplateResult> {
    // Slug tekshiruvi HAR QANDAY DB amalidan oldin: `__proto__` kabi qiymat
    // `ROLE_TEMPLATES[slug]` orqali o'tib ketmasin.
    if (!isRoleTemplateSlug(slug)) {
      throw new BadRequestException(`Noma'lum rol shabloni: ${String(slug)}`);
    }
    const tpl = ROLE_TEMPLATES[slug];

    const existing = await this.prisma.client.role.findFirst({
      where: { id: roleId, accountId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Role ${roleId} not found`);

    const matrix = resolveTemplateMatrix(slug);
    const cells = matrix.filter((c) => c.scope !== 'NO');

    // G1 — yozishdan OLDIN, atomik rad etish (yarim qo'llash yo'q).
    await this.assertNoEscalation(actorEmployeeId, cells);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Optimistic lock: matritsa to'liq qayta yozilgani uchun eskirgan
        // version bilan kelgan chaqiruv boshqa sessiyaning tahririni
        // jimgina bosib ketardi.
        await tx.role.update({
          where: { id: roleId, accountId, version },
          data: {
            templateSlug: slug,
            // Kiosk rejimi shablon bilan BIRGA ko'chadi: «Kassir» shabloni
            // qo'llanib, uiMode `full` qolsa — kassir butun ERP menyusini
            // ko'rib turardi (kassa TZ §3.1 buzilishi).
            uiMode: tpl.uiMode,
            version: { increment: 1 },
          },
        });
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: cells.map((c) => ({
            roleId,
            entity: c.entity,
            action: c.action,
            scope: c.scope,
          })),
          skipDuplicates: true,
        });
        // G3 — audit. Katakchalarni birma-bir yozmaymiz (504 qator): shablon
        // nomi + soni yetarli, matritsaning o'zi registrda deterministik.
        await tx.auditLog.create({
          data: {
            accountId,
            userId: actorEmployeeId,
            entity: 'role',
            entityId: roleId,
            action: 'template-apply',
            fieldChanges: {
              templateSlug: { before: null, after: slug },
              cells: { before: null, after: String(cells.length) },
            },
          },
        });
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Role');
      this.handlePrisma(e);
    }

    const maskedByOverride = await this.collectMaskedOverrides(accountId, roleId, matrix);

    return {
      role: await this.findOne(accountId, roleId),
      slug,
      applied: cells.length,
      maskedByOverride,
    };
  }

  /**
   * Shablon qo'llangandan keyin ham kuchda qoladigan individual tuzatishlar.
   *
   * Faqat shablondan **FARQ qiladigan** qatorlar qaytadi: override scope
   * shablon bilan bir xil bo'lsa amaldagi ruxsat o'zgarmaydi, ya'ni uni
   * ro'yxatga qo'shish ogohlantirishni shovqinga aylantirardi.
   */
  private async collectMaskedOverrides(
    accountId: string,
    roleId: string,
    matrix: readonly TemplateCell[],
  ): Promise<MaskedOverride[]> {
    const members = await this.prisma.client.employeeRole.findMany({
      where: { roleId },
      select: { employeeId: true },
    });
    if (members.length === 0) return [];
    const memberIds = members.map((m) => m.employeeId);

    const overrides = await this.prisma.client.employeePermission.findMany({
      where: { accountId, employeeId: { in: memberIds } },
      select: {
        employeeId: true,
        entity: true,
        action: true,
        scope: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const templateScope = new Map(matrix.map((c) => [`${c.entity}.${c.action}`, c.scope]));

    const rows: MaskedOverride[] = [];
    for (const o of overrides) {
      const tplScope = templateScope.get(`${o.entity}.${o.action}`) ?? 'NO';
      if (tplScope === o.scope) continue;
      rows.push({
        employeeId: o.employeeId,
        employeeName:
          `${o.employee?.lastName ?? ''} ${o.employee?.firstName ?? ''}`.trim() || o.employeeId,
        entity: o.entity,
        action: o.action as PermissionAction,
        templateScope: tplScope,
        overrideScope: o.scope as PermissionScope,
      });
    }
    // Barqaror tartib — UI ro'yxati va testlar chayqalmasin.
    rows.sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.entity.localeCompare(b.entity) ||
        a.action.localeCompare(b.action),
    );

    // Yangi matritsa darhol kuchga kirsin (cache TTL 5 daqiqa).
    for (const id of memberIds) this.permissions.invalidate(id);

    return rows;
  }

  async delete(accountId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.client.role.findFirst({
      where: { id, accountId },
      select: { id: true, isSystem: true, _count: { select: { employees: true } } },
    });
    if (!existing) throw new NotFoundException(`Role ${id} not found`);
    if (existing.isSystem) {
      throw new ForbiddenException("Tizim rollarini o'chirib bo'lmaydi");
    }
    if (existing._count.employees > 0) {
      throw new ConflictException(
        `Bu rolda ${existing._count.employees} ta xodim bor — avval ularni boshqa rolga ko'chiring`,
      );
    }
    await this.prisma.client.role.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Read the RBAC roles currently assigned to one employee (Settings → Users
   * access-rights panel). Tenant-guarded on the employee.
   */
  async getEmployeeRoles(accountId: string, employeeId: string): Promise<{ roleIds: string[] }> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');
    const rows = await this.prisma.client.employeeRole.findMany({
      where: { employeeId },
      select: { roleId: true },
    });
    return { roleIds: rows.map((r) => r.roleId) };
  }

  /**
   * Replace the full set of RBAC roles for one employee. Both the employee and
   * every role id are tenant-scoped, so a cross-tenant role id (or employee id)
   * is rejected — without that check, EmployeeRole.create would happily link an
   * employee to another tenant's role (an access-control breach). The delete +
   * recreate runs in one transaction so a partial failure cannot strand the
   * employee with half their roles.
   */
  async setEmployeeRoles(
    accountId: string,
    employeeId: string,
    roleIds: string[],
    actorId?: string,
  ): Promise<{ roleIds: string[] }> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        id: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');

    const unique = [...new Set(roleIds)];
    let nextNames: string[] = [];
    if (unique.length > 0) {
      const valid = await this.prisma.client.role.findMany({
        where: { id: { in: unique }, accountId },
        select: { id: true, name: true },
      });
      if (valid.length !== unique.length) {
        throw new BadRequestException('Rol topilmadi');
      }
      nextNames = valid.map((r) => r.name);
    }

    const beforeNames = employee.roles.map((r) => r.role.name);
    // Self-lockout guard (same philosophy as the self-archive block): an
    // admin/owner may not strip their OWN admin access — they'd lose the
    // settings section they are standing in. Another admin (or the owner
    // via «Сделать владельцем») demotes them instead.
    const ADMINISH = ADMINISH_ROLE_NAMES;
    if (
      actorId === employeeId &&
      beforeNames.some((n) => ADMINISH.includes(n)) &&
      !nextNames.some((n) => ADMINISH.includes(n))
    ) {
      throw new BadRequestException("O'zingizni administratorlikdan chiqara olmaysiz");
    }
    await this.prisma.client.$transaction([
      this.prisma.client.employeeRole.deleteMany({ where: { employeeId } }),
      ...(unique.length > 0
        ? [
            this.prisma.client.employeeRole.createMany({
              data: unique.map((roleId) => ({ employeeId, roleId })),
              skipDuplicates: true,
            }),
          ]
        : []),
      // moysklad employee «История изменений»: role/access changes are audited
      // (entity='employee'), like every other card mutation.
      ...(JSON.stringify(beforeNames) !== JSON.stringify(nextNames)
        ? [
            this.prisma.client.auditLog.create({
              data: {
                accountId,
                userId: actorId ?? null,
                entity: 'employee',
                entityId: employeeId,
                action: 'roles-change',
                fieldChanges: {
                  roles: { before: beforeNames.join(', '), after: nextNames.join(', ') },
                },
              },
            }),
          ]
        : []),
    ]);
    return { roleIds: unique };
  }

  /**
   * moysklad «Владелец аккаунта» — a singleton system role (full access,
   * transferable via «Сделать владельцем»). Created lazily because existing
   * accounts predate it. The entity×action universe is copied from the seeded
   * Administrator role so it always matches the account's seed, then forced
   * to ALL scope.
   */
  async ensureOwnerRole(accountId: string): Promise<string> {
    const existing = await this.prisma.client.role.findFirst({
      where: { accountId, name: OWNER_ROLE_NAME },
      select: { id: true },
    });
    if (existing) return existing.id;

    const admin = await this.prisma.client.role.findFirst({
      where: { accountId, name: 'Administrator' },
      select: { id: true },
    });
    const cells = admin
      ? await this.prisma.client.rolePermission.findMany({
          where: { roleId: admin.id },
          select: { entity: true, action: true },
        })
      : [];
    try {
      const created = await this.prisma.client.role.create({
        data: {
          accountId,
          name: OWNER_ROLE_NAME,
          description: "Akkaunt egasi — to'liq kirish, egalikni o'tkaza oladi",
          isSystem: true,
          permissions: {
            createMany: {
              data: cells.map((c) => ({ ...c, scope: 'ALL' })),
              skipDuplicates: true,
            },
          },
        },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      // P2002 = a concurrent ensure won the race — reuse its row.
      if ((e as { code?: string }).code === 'P2002') {
        const raced = await this.prisma.client.role.findFirst({
          where: { accountId, name: OWNER_ROLE_NAME },
          select: { id: true },
        });
        if (raced) return raced.id;
      }
      throw e;
    }
  }

  /**
   * moysklad «Доступ только к точкам продаж» — retail-only system role.
   *
   * 🔴 P11 (2026-08-11): matritsa endi `cashier` SHABLONIDAN olinadi va rol
   * `uiMode='kiosk'` bilan yaratiladi. Ilgari bu yerda 10 katakchali qo'lda
   * yozilgan ro'yxat turardi va `uiMode` sukut bo'yicha `full` qolardi —
   * ya'ni xodim kartasidagi «faqat savdo nuqtalari» radiosi (egasi uchun eng
   * ko'rinadigan «kassir qilish» yo'li) aslida BUTUN ERP menyusiga ega,
   * qarz to'lovi/xarajat/zakaz qabuli esa 403 beradigan yarim-kassir
   * yaratardi. Endi ikkala yo'l — bu radio va shablon tanlash — bir xil
   * (registr: `role-templates.ts#cashier`, `KIOSK_ALLOWED` bilan mos).
   *
   * MAVJUD rollar TEGILMAYDI (pastdagi erta qaytish): ishlab turgan hisobda
   * kimningdir kirishi jimgina torayib/kengayib ketmasin.
   */
  async ensurePosRole(accountId: string): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.client.role.findFirst({
      where: { accountId, name: POS_ROLE_NAME },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    const tpl = ROLE_TEMPLATES.cashier;
    const cells = resolveTemplateMatrix('cashier').filter((c) => c.scope !== 'NO');
    try {
      return await this.prisma.client.role.create({
        data: {
          accountId,
          name: POS_ROLE_NAME,
          description: 'Faqat savdo nuqtalari (kassa) uchun kirish',
          isSystem: true,
          templateSlug: 'cashier',
          uiMode: tpl.uiMode,
          permissions: {
            createMany: {
              data: cells.map((c) => ({ entity: c.entity, action: c.action, scope: c.scope })),
              skipDuplicates: true,
            },
          },
        },
        select: { id: true, name: true },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        const raced = await this.prisma.client.role.findFirst({
          where: { accountId, name: POS_ROLE_NAME },
          select: { id: true, name: true },
        });
        if (raced) return raced;
      }
      throw e;
    }
  }

  /**
   * moysklad «Сделать владельцем»: move the singleton owner role to
   * `targetEmployeeId`. Only the CURRENT owner may transfer it (when an owner
   * exists); on a legacy account with no owner yet, any caller who passed the
   * controller's employee/update gate may claim it once. The previous owner
   * keeps working as Администратор (moysklad behaviour). Audit rows are
   * written for both employees so the card's «История изменений» shows the
   * hand-over.
   */
  async transferOwner(
    accountId: string,
    targetEmployeeId: string,
    actorEmployeeId: string,
  ): Promise<{ ok: true; ownerRoleId: string }> {
    const target = await this.prisma.client.employee.findFirst({
      where: { id: targetEmployeeId, accountId },
      select: { id: true, archived: true },
    });
    if (!target) throw new NotFoundException('Xodim topilmadi');
    if (target.archived) {
      throw new BadRequestException("Arxivlangan xodimni egasi qilib bo'lmaydi");
    }

    const ownerRoleId = await this.ensureOwnerRole(accountId);
    const holders = await this.prisma.client.employeeRole.findMany({
      where: { roleId: ownerRoleId, employee: { accountId } },
      select: { employeeId: true },
    });
    if (holders.length > 0 && !holders.some((h) => h.employeeId === actorEmployeeId)) {
      throw new ForbiddenException("Faqat joriy egasi egalikni o'tkaza oladi");
    }
    // MK40 brauzer-QA: egasi HALI YO'Q bo'lsa yuqoridagi shart butunlay
    // o'chib qolardi — `employee:update` ruxsati bo'lgan oddiy xodim o'z
    // kartasidagi «Egasi qilish» tugmasi bilan o'zini egasi qilib olardi
    // (cheklangan roli o'chib, cheksiz egalik kelardi). G1 bu yo'lni ko'rmaydi:
    // bu yerda matritsa yozilmaydi, tayyor tizim roli biriktiriladi.
    // Birinchi egani faqat allaqachon cheksiz kirishga ega aktor tayinlaydi.
    if (holders.length === 0) {
      const actor = await this.prisma.client.employee.findUnique({
        where: { id: actorEmployeeId },
        select: { roles: { select: { role: { select: { name: true } } } } },
      });
      const actorIsAdminish = (actor?.roles ?? []).some((r) =>
        ADMINISH_ROLE_NAMES.includes(r.role.name),
      );
      if (!actorIsAdminish) {
        throw new ForbiddenException(
          "Egani faqat administrator tayinlay oladi — o'zingizda yo'q huquqni bera olmaysiz",
        );
      }
    }
    if (holders.length === 1 && holders[0]?.employeeId === targetEmployeeId) {
      return { ok: true, ownerRoleId }; // idempotent — already the owner
    }

    const adminRole = await this.prisma.client.role.findFirst({
      where: { accountId, name: 'Administrator' },
      select: { id: true },
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.employeeRole.deleteMany({ where: { roleId: ownerRoleId } });
      // Owner role REPLACES the target's other roles (matrix radio semantics).
      await tx.employeeRole.deleteMany({ where: { employeeId: targetEmployeeId } });
      await tx.employeeRole.create({
        data: { employeeId: targetEmployeeId, roleId: ownerRoleId },
      });
      // Previous owner falls back to Администратор so they keep working.
      for (const h of holders) {
        if (h.employeeId === targetEmployeeId || !adminRole) continue;
        await tx.employeeRole.createMany({
          data: [{ employeeId: h.employeeId, roleId: adminRole.id }],
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: {
          accountId,
          userId: actorEmployeeId,
          entity: 'employee',
          entityId: targetEmployeeId,
          action: 'owner-transfer',
          fieldChanges: {
            role: { before: holders.map((h) => h.employeeId).join(','), after: 'owner' },
          },
        },
      });
    });
    // Role→scope caches may hold the old owner's matrix for up to the TTL;
    // acceptable, PermissionsGuard re-resolves on expiry.
    return { ok: true, ownerRoleId };
  }

  /** Drop NO-scope cells (default) and dedupe by (entity, action). */
  private normalizePermissions(cells: RolePermissionCellInput[]) {
    const map = new Map<
      string,
      { entity: PermissionEntity; action: PermissionAction; scope: PermissionScope }
    >();
    for (const c of cells) {
      if (c.scope === 'NO') continue;
      map.set(`${c.entity}:${c.action}`, {
        entity: c.entity as PermissionEntity,
        action: c.action,
        scope: c.scope,
      });
    }
    return [...map.values()];
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu nomdagi rol allaqachon mavjud');
    }
    throw e as Error;
  }
}
