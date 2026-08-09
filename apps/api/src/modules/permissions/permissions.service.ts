import type { Prisma } from '@moysklad/db';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type ActorContext,
  type PermissionAction,
  type PermissionEntity,
  type PermissionScope,
  type RecordContext,
  SYSTEM_ROLE_TEMPLATES,
  canAccessRecord,
  isAtLeast,
  maxScope,
  scopeFromTemplate,
} from './permissions.types.js';

/**
 * Permission resolution service.
 *
 * Loads effective scope for (employee, entity, action) by walking the
 * employee's assigned roles and taking MAX across all role_permissions.
 *
 * In-memory cache per employee: permissions change rarely; invalidate on
 * role assign/revoke. TTL fallback 5 min.
 */
@Injectable()
export class PermissionsService {
  private cache = new Map<
    string,
    { at: number; perms: Map<string, PermissionScope>; actor: ActorContext }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Explicit cache invalidation when roles change. */
  invalidate(employeeId: string): void {
    this.cache.delete(employeeId);
  }

  /**
   * Resolve the effective scope for (employee, entity, action).
   * Returns 'NO' if employee has no role granting access.
   */
  async resolveScope(
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction,
  ): Promise<PermissionScope> {
    const data = await this.getCachedOrLoad(employeeId);
    return data.perms.get(`${entity}.${action}`) ?? 'NO';
  }

  async getActorContext(employeeId: string): Promise<ActorContext> {
    const data = await this.getCachedOrLoad(employeeId);
    return data.actor;
  }

  /** Throws ForbiddenException if scope is below required. */
  async require(
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction,
    requiredScope: PermissionScope = 'OWN',
  ): Promise<PermissionScope> {
    const scope = await this.resolveScope(employeeId, entity, action);
    if (!isAtLeast(scope, requiredScope)) {
      throw new ForbiddenException(
        `Ruxsat yo'q: ${entity}.${action} uchun kamida ${requiredScope} kerak (sizda: ${scope})`,
      );
    }
    return scope;
  }

  /** Per-record access check (for single-record ops). */
  async canAccessRecord(
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction,
    record: RecordContext,
  ): Promise<boolean> {
    const scope = await this.resolveScope(employeeId, entity, action);
    if (scope === 'NO') return false;
    if (scope === 'ALL') return true;
    const actor = await this.getActorContext(employeeId);
    return canAccessRecord(scope, actor, record);
  }

  /**
   * Build Prisma `where` clause fragment that restricts rows to what the
   * user can see given their scope. Returns {} for ALL, impossible condition
   * for NO. Use `AND: [...]` in caller.
   */
  async scopedWhere(
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction = 'view',
  ): Promise<Prisma.JsonObject> {
    const scope = await this.resolveScope(employeeId, entity, action);
    if (scope === 'NO') {
      // impossible condition — returns nothing
      return { id: '__never__' } as unknown as Prisma.JsonObject;
    }
    if (scope === 'ALL') return {};

    const actor = await this.getActorContext(employeeId);
    switch (scope) {
      case 'OWN':
        return {
          OR: [{ ownerId: actor.employeeId }, { shared: true }],
        } as unknown as Prisma.JsonObject;
      case 'OWN_GROUP':
        if (!actor.groupId) {
          return {
            OR: [{ shared: true }, { ownerId: actor.employeeId }],
          } as unknown as Prisma.JsonObject;
        }
        return {
          OR: [{ groupId: actor.groupId }, { shared: true }],
        } as unknown as Prisma.JsonObject;
      case 'OWN_AND_GROUP':
        return {
          OR: [
            { ownerId: actor.employeeId },
            ...(actor.groupId ? [{ groupId: actor.groupId }] : []),
            { shared: true },
          ],
        } as unknown as Prisma.JsonObject;
    }
    return {};
  }

  /**
   * H4 record-scope (RFC _H4-OWN-GROUP-SCOPE-RFC.md, W4). Per-account opt-in flag.
   * Read fresh (NOT cached) so flipping it takes effect immediately — it gates the
   * read-path scope filter below. Default false → no behaviour change.
   */
  async isRecordScopeEnforced(accountId: string): Promise<boolean> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      select: { recordScopeEnforced: true },
    });
    return account?.recordScopeEnforced ?? false;
  }

  /**
   * Flag-gated `scopedWhere`. Returns {} (no filter) when the account has not
   * opted into record-scope enforcement, so callers can always AND it into their
   * list `where` with zero effect until the flag is on. When enforced, returns the
   * OWN / OWN_GROUP / ... OR-clause over {ownerId, groupId, shared}.
   */
  async recordScopeWhere(
    accountId: string,
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction = 'view',
  ): Promise<Prisma.JsonObject> {
    if (!(await this.isRecordScopeEnforced(accountId))) return {};
    return this.scopedWhere(employeeId, entity, action);
  }

  /**
   * Flag-gated single-record access check (for findById). Returns true (allow)
   * when the account has not opted in; otherwise defers to `canAccessRecord`.
   * Callers throw NotFound (not Forbidden) on false to avoid leaking existence
   * (mirrors the tenant-guard pattern).
   */
  async assertRecordAccess(
    accountId: string,
    employeeId: string,
    entity: PermissionEntity,
    action: PermissionAction,
    record: RecordContext,
  ): Promise<boolean> {
    if (!(await this.isRecordScopeEnforced(accountId))) return true;
    return this.canAccessRecord(employeeId, entity, action, record);
  }

  private async getCachedOrLoad(employeeId: string): Promise<{
    at: number;
    perms: Map<string, PermissionScope>;
    actor: ActorContext;
  }> {
    const cached = this.cache.get(employeeId);
    if (cached && Date.now() - cached.at < this.CACHE_TTL) return cached;

    const employee = await this.prisma.client.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        groupId: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });
    if (!employee) {
      const empty = {
        at: Date.now(),
        perms: new Map<string, PermissionScope>(),
        actor: { employeeId, groupId: null } as ActorContext,
      };
      this.cache.set(employeeId, empty);
      return empty;
    }

    const perms = new Map<string, PermissionScope>();
    for (const er of employee.roles) {
      for (const p of er.role.permissions) {
        const key = `${p.entity}.${p.action}`;
        const current = perms.get(key) ?? 'NO';
        perms.set(key, maxScope(current, p.scope as PermissionScope));
      }
    }

    const entry = {
      at: Date.now(),
      perms,
      actor: { employeeId: employee.id, groupId: employee.groupId } as ActorContext,
    };
    this.cache.set(employeeId, entry);
    return entry;
  }

  /**
   * Provision default system roles for a new account and assign admin role
   * to the first employee. Idempotent — checks existence first.
   */
  async seedSystemRoles(accountId: string, adminEmployeeId: string): Promise<void> {
    // ⚠️ NOT WIRED to any runtime path (no caller as of 2026-07-03) — the live
    // seeding of role permissions happens in packages/db/prisma/seed.ts, whose
    // `entities` list MUST stay in sync with this one (and both with
    // PermissionEntity in permissions.types.ts). When an entity exists in a
    // controller's @RequirePermission but not in the seed list, every seeded
    // tenant 403s on that module (2026-07-03: 'currency' was missing → the
    // «Валюта документа» picker on 9 doc editors got 403 on fresh DBs).
    const entities: PermissionEntity[] = [
      'product',
      'productfolder',
      'variant',
      'bundle',
      'service',
      'pricetype',
      'counterparty',
      'contactperson',
      'organization',
      'branch',
      'store',
      'cashdesk',
      'bankaccount',
      'employee',
      'role',
      'mxik',
      'exchangerate',
      'currency',
      'project',
      'contract',
      'uom',
      'taxrate',
      'expenseitem',
      'customentity',
      'region',
      'country',
      'trackingcode',
      'discount',
      'customerorder',
      'demand',
      'invoiceout',
      'salesreturn',
      'factureout',
      'commissionreport',
      'consignment',
      'purchaseorder',
      'supply',
      'invoicein',
      'purchasereturn',
      'facturein',
      'paymentin',
      'paymentout',
      'cashin',
      'cashout',
      'bankimport',
      'counterpartyadjustment',
      'prepayment',
      'prepaymentreturn',
      'move',
      'loss',
      'enter',
      'inventory',
      'internalorder',
      'pricelist',
      'bom',
      'workorder',
      'processingorder',
      'processing',
      'processingprocess',
      'processingstage',
      'payroll',
      'cashiersession',
      'retailsale',
      'saleschannel',
      'onlineorder',
      'pipeline',
      'opportunity',
      'call',
      'task',
      'tasktype',
      'attachment',
      'publication',
      'label',
      'auditlog',
      'report',
      'analitika',
      'settings',
      // Debts (Sherset KEEP — B3) — MASTER-TODO #19.
      'debt',
      'debtpayment',
      'debtcardpayment',
      'debtreport',
    ];
    const actions: PermissionAction[] = ['view', 'create', 'update', 'delete', 'approve', 'print'];

    for (const [name, tpl] of Object.entries(SYSTEM_ROLE_TEMPLATES)) {
      // Idempotent role row — upsert by (accountId, name).
      const role = await this.prisma.client.role.upsert({
        where: { accountId_name: { accountId, name } },
        create: {
          accountId,
          name,
          description: tpl.description,
          isSystem: true,
        },
        update: {},
      });

      // Top-up missing permission rows. createMany with skipDuplicates means
      // re-running this on an account that already has the seed only adds
      // the entries we expanded the entity universe with — never overwrites
      // a tenant's manual scope overrides.
      const perms: Prisma.RolePermissionCreateManyInput[] = [];
      for (const entity of entities) {
        for (const action of actions) {
          // Per-entity override (qarz rollari) → defaults → 'NO'. Shu funksiya
          // tufayli «kassir naqd qabul qiladi, lekin screenshot kirita olmaydi»
          // qoidasi seed'da mexanik ravishda yoziladi (TZ §6).
          // MASTER-TODO #20: oldin bu yerda faqat `tpl.defaults[action]` o'qilardi
          // → override'li rollar (QarzOperatori/QarzKassiri) NOTO'G'RI seed
          // bo'lardi (operator screenshot to'lovini kirita olmay qolardi).
          const scope = scopeFromTemplate(tpl, entity, action);
          perms.push({
            roleId: role.id,
            entity,
            action,
            scope,
          });
        }
      }
      await this.prisma.client.rolePermission.createMany({
        data: perms,
        skipDuplicates: true,
      });

      // Assign Administrator role to the first admin if this is that role
      if (name === 'Administrator') {
        await this.prisma.client.employeeRole.upsert({
          where: {
            employeeId_roleId: { employeeId: adminEmployeeId, roleId: role.id },
          },
          update: {},
          create: {
            employeeId: adminEmployeeId,
            roleId: role.id,
          },
        });
      }
    }
    this.invalidate(adminEmployeeId);
  }
}
