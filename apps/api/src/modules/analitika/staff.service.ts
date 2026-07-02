import type { Prisma } from '@moysklad/db';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { throwIfEmployeeUniqueViolation } from '../shared/employee-unique.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { CreateStaffSchema, StaffListFilterSchema, UpdateStaffSchema } from './staff.schema.js';

export interface StaffRow {
  id: string;
  email: string | null;
  name: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  phone: string | null;
  username: string | null;
  archived: boolean;
  lastLoginAt: string | null;
}

export interface StaffDetail extends StaffRow {
  isChecker: boolean;
  hrRoles: string[];
  /** Optimistic-lock token — the edit form round-trips it on Save. */
  version: number;
  /** RBAC roles assigned to this employee (Role.id + Role.name + isSystem). */
  roles: Array<{ id: string; name: string; isSystem: boolean }>;
}

export interface StaffListResponse {
  rows: StaffRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Thin per-account staff endpoint for the Analitika /xodimlar UI.
 * Mirrors the shape of the HR module's `GET /hr/employees`, but gated by the
 * `analitika` RBAC entity (not the HR permission matrix). Create/update
 * mutations live here too — wizard form in /analitika/xodimlar/yangi posts
 * straight to this controller so the admin never leaves the Analitika UI.
 */
@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown): Promise<StaffListResponse> {
    const filter = StaffListFilterSchema.parse(raw);
    const skip = (filter.page - 1) * filter.pageSize;
    const where: Prisma.EmployeeWhereInput = {
      accountId,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' as const } },
              { fullName: { contains: filter.search, mode: 'insensitive' as const } },
              { email: { contains: filter.search, mode: 'insensitive' as const } },
              { username: { contains: filter.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.employee.findMany({
        where,
        select: this.rowSelect,
        orderBy: [{ archived: 'asc' }, { name: 'asc' }],
        skip,
        take: filter.pageSize,
      }),
      this.prisma.client.employee.count({ where }),
    ]);

    return {
      rows: rows.map((r) => this.toRow(r)),
      total,
      page: filter.page,
      limit: filter.pageSize,
    };
  }

  async findOne(accountId: string, id: string): Promise<StaffDetail> {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: {
        ...this.rowSelect,
        isChecker: true,
        hrRoles: true,
        version: true,
        // Pull EmployeeRole join + Role details for the matrix preview.
        // Filter by Role.accountId so cross-tenant rows can't leak.
      },
    });
    if (!emp) throw new NotFoundException(`Employee ${id} not found`);

    const roleLinks = await this.prisma.client.employeeRole.findMany({
      where: { employeeId: id, role: { accountId } },
      select: { role: { select: { id: true, name: true, isSystem: true } } },
      orderBy: { role: { name: 'asc' } },
    });

    return {
      ...this.toRow(emp),
      isChecker: emp.isChecker,
      hrRoles: emp.hrRoles ?? [],
      version: emp.version,
      roles: roleLinks.map((l) => l.role),
    };
  }

  async create(accountId: string, raw: unknown): Promise<StaffDetail> {
    const input = CreateStaffSchema.parse(raw);

    // Email is the auth subject. Username is optional but globally unique
    // per-account when present — the same constraint HR uses (account_id +
    // username unique index migrated in earlier sprint).
    const dupEmail = await this.prisma.client.employee.findFirst({
      where: { accountId, email: input.email },
      select: { id: true },
    });
    if (dupEmail) throw new ConflictException('Bu email allaqachon ishlatilgan');

    if (input.username) {
      const dupUser = await this.prisma.client.employee.findFirst({
        where: { accountId, username: input.username },
        select: { id: true },
      });
      if (dupUser) throw new ConflictException('Bu login allaqachon ishlatilgan');
    }

    await this.assertRolesExist(accountId, input.roleIds);
    const passwordHash = await argon2.hash(input.password);

    let created: string;
    try {
      created = await this.prisma.client.$transaction(async (tx) => {
        const emp = await tx.employee.create({
          data: {
            accountId,
            email: input.email,
            name: input.name,
            fullName: input.fullName ?? null,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            position: input.position ?? null,
            phone: input.phone ?? null,
            username: input.username ?? null,
            passwordHash,
          },
          select: { id: true },
        });

        if (input.roleIds.length > 0) {
          await tx.employeeRole.createMany({
            data: input.roleIds.map((roleId) => ({ employeeId: emp.id, roleId })),
            skipDuplicates: true,
          });
        }

        return emp.id;
      });
    } catch (e) {
      // The pre-checks above are a TOCTOU window: a concurrent create with the
      // same email/username can slip past them and hit the DB unique index.
      // Map that P2002 to the same friendly 409 the pre-check would have raised.
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }

    return this.findOne(accountId, created);
  }

  async update(accountId: string, id: string, raw: unknown): Promise<StaffDetail> {
    const input = UpdateStaffSchema.parse(raw);
    const existing = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true, email: true, username: true },
    });
    if (!existing) throw new NotFoundException(`Employee ${id} not found`);

    if (input.email !== undefined && input.email !== existing.email) {
      const dupEmail = await this.prisma.client.employee.findFirst({
        where: { accountId, email: input.email, NOT: { id } },
        select: { id: true },
      });
      if (dupEmail) throw new ConflictException('Bu email allaqachon ishlatilgan');
    }
    if (input.username !== undefined && input.username !== existing.username) {
      const dupUser = await this.prisma.client.employee.findFirst({
        where: { accountId, username: input.username, NOT: { id } },
        select: { id: true },
      });
      if (dupUser) throw new ConflictException('Bu login allaqachon ishlatilgan');
    }
    if (input.roleIds !== undefined) {
      await this.assertRolesExist(accountId, input.roleIds);
    }

    const data: Prisma.EmployeeUpdateInput = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.name !== undefined) data.name = input.name;
    if (input.fullName !== undefined) data.fullName = input.fullName ?? null;
    if (input.firstName !== undefined) data.firstName = input.firstName ?? null;
    if (input.lastName !== undefined) data.lastName = input.lastName ?? null;
    if (input.position !== undefined) data.position = input.position ?? null;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.username !== undefined) data.username = input.username ?? null;
    if (input.archived !== undefined) data.archived = input.archived;
    if (input.password) data.passwordHash = await argon2.hash(input.password);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        // Optimistic lock: ALWAYS run the versioned header update FIRST — even a
        // roleIds-only edit (empty `data`) must bump the version (and 409 on a
        // stale one) so the EmployeeRole rewrite below is guarded against a
        // concurrent clobber. findFirst above proved existence, so a P2025 here
        // is a version mismatch; it aborts the tx, rolling back the role rewrite.
        await tx.employee.update({
          where: { id, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (input.roleIds !== undefined) {
          // Replace the full set in one shot so the UI stays in control of
          // role membership — drop then recreate within the transaction.
          await tx.employeeRole.deleteMany({ where: { employeeId: id } });
          if (input.roleIds.length > 0) {
            await tx.employeeRole.createMany({
              data: input.roleIds.map((roleId) => ({ employeeId: id, roleId })),
              skipDuplicates: true,
            });
          }
        }
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Employee');
      // A concurrent edit can change email/username past the pre-check, then
      // race into the DB unique index → P2002. Map it to a friendly 409.
      throwIfEmployeeUniqueViolation(e);
      throw e;
    }

    return this.findOne(accountId, id);
  }

  /** Lightweight role catalogue for the wizard step. Mirrors `/roles` but
   *  gated by the analitika RBAC entity (admins editing staff need to read
   *  roles, but should not need a separate role.view grant). */
  async listRoles(
    accountId: string,
  ): Promise<Array<{ id: string; name: string; description: string | null; isSystem: boolean }>> {
    return this.prisma.client.role.findMany({
      where: { accountId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, isSystem: true },
    });
  }

  private async assertRolesExist(accountId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const found = await this.prisma.client.role.findMany({
      where: { accountId, id: { in: roleIds } },
      select: { id: true },
    });
    if (found.length !== roleIds.length) {
      throw new NotFoundException('Rollardan biri topilmadi');
    }
  }

  private readonly rowSelect = {
    id: true,
    email: true,
    name: true,
    fullName: true,
    firstName: true,
    lastName: true,
    position: true,
    phone: true,
    username: true,
    archived: true,
    lastLoginAt: true,
  } as const;

  private toRow(r: {
    id: string;
    email: string | null;
    name: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
    phone: string | null;
    username: string | null;
    archived: boolean;
    lastLoginAt: Date | null;
  }): StaffRow {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      fullName: r.fullName,
      firstName: r.firstName,
      lastName: r.lastName,
      position: r.position,
      phone: r.phone,
      username: r.username,
      archived: r.archived,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    };
  }
}
