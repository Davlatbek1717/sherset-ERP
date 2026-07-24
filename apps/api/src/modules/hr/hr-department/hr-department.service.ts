import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CreateHrDepartmentInput, UpdateHrDepartmentInput } from './hr-department.schema.js';

/**
 * Bo'lim (department) name-catalog CRUD. Soft-delete (archived); blocks delete
 * while active employees still carry the name in their free-text
 * `Employee.department` string. Active-name uniqueness enforced at the service
 * layer (no DB @@unique — so archived names can be re-used). Mirrors
 * HrRoleService (uniqueness pre-check) + HrWorkLocationService (soft-delete +
 * assigned-block). See spec §5.2.
 */
@Injectable()
export class HrDepartmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, includeArchived = false) {
    const rows = await this.prisma.client.hrDepartment.findMany({
      where: { accountId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: { name: 'asc' },
    });
    // employeeCount by matching free-text string (no FK) — one grouped query.
    const counts = await this.prisma.client.employee.groupBy({
      by: ['department'],
      where: { accountId, archived: false, department: { in: rows.map((r) => r.name) } },
      _count: { _all: true },
    });
    const byName = new Map(counts.map((c) => [c.department, c._count._all]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      archived: r.archived,
      employeeCount: byName.get(r.name) ?? 0,
    }));
  }

  async create(accountId: string, input: CreateHrDepartmentInput) {
    await this.assertNameFree(accountId, input.name);
    return this.prisma.client.hrDepartment.create({ data: { accountId, name: input.name } });
  }

  async update(accountId: string, id: string, input: UpdateHrDepartmentInput) {
    await this.findOrThrow(accountId, id);
    await this.assertNameFree(accountId, input.name, id);
    return this.prisma.client.hrDepartment.update({ where: { id }, data: { name: input.name } });
  }

  async remove(accountId: string, id: string) {
    const row = await this.findOrThrow(accountId, id);
    const assigned = await this.prisma.client.employee.count({
      where: { accountId, department: row.name, archived: false },
    });
    if (assigned > 0) {
      throw new BadRequestException(
        "Bu bo'limga xodimlar biriktirilgan — avval ularni boshqa bo'limga o'tkazing",
      );
    }
    await this.prisma.client.hrDepartment.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  private async assertNameFree(accountId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.client.hrDepartment.findFirst({
      where: { accountId, name, archived: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new BadRequestException("Bu bo'lim allaqachon mavjud");
  }

  private async findOrThrow(accountId: string, id: string) {
    const row = await this.prisma.client.hrDepartment.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException("Bo'lim topilmadi");
    return row;
  }
}
