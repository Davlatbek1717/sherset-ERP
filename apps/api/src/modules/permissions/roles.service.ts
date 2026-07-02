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
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';
import {
  CreateRoleSchema,
  type RolePermissionCellInput,
  UpdateRoleSchema,
} from './roles.schema.js';

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
 * Roles CRUD for the Analitika /sozlamalar/rollar admin page. System roles
 * (Administrator/Manager/Employee/ReadOnly seeded at provisioning) can have
 * their permissions edited but cannot be renamed or deleted — that's a
 * standard RBAC safety rail.
 */
@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

  async create(accountId: string, raw: unknown): Promise<RoleDetail> {
    const parsed = CreateRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
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

  async update(accountId: string, id: string, raw: unknown): Promise<RoleDetail> {
    const parsed = UpdateRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
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
  ): Promise<{ roleIds: string[] }> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');

    const unique = [...new Set(roleIds)];
    if (unique.length > 0) {
      const valid = await this.prisma.client.role.findMany({
        where: { id: { in: unique }, accountId },
        select: { id: true },
      });
      if (valid.length !== unique.length) {
        throw new BadRequestException('Rol topilmadi');
      }
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
    ]);
    return { roleIds: unique };
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
