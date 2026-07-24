import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CreateHrPositionInput, UpdateHrPositionInput } from './hr-position.schema.js';

/**
 * Lavozim (position) name-catalog CRUD. Same shape as HrDepartmentService but
 * keyed on the free-text `Employee.position` string. Adds `findOne` for the
 * positions → employees drill. See spec §5.2.
 */
@Injectable()
export class HrPositionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, includeArchived = false) {
    const rows = await this.prisma.client.hrPosition.findMany({
      where: { accountId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.client.employee.groupBy({
      by: ['position'],
      where: { accountId, archived: false, position: { in: rows.map((r) => r.name) } },
      _count: { _all: true },
    });
    const byName = new Map(counts.map((c) => [c.position, c._count._all]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      archived: r.archived,
      employeeCount: byName.get(r.name) ?? 0,
    }));
  }

  async findOne(accountId: string, id: string) {
    const row = await this.findOrThrow(accountId, id);
    return { id: row.id, name: row.name, archived: row.archived };
  }

  async create(accountId: string, input: CreateHrPositionInput) {
    await this.assertNameFree(accountId, input.name);
    return this.prisma.client.hrPosition.create({ data: { accountId, name: input.name } });
  }

  async update(accountId: string, id: string, input: UpdateHrPositionInput) {
    await this.findOrThrow(accountId, id);
    await this.assertNameFree(accountId, input.name, id);
    return this.prisma.client.hrPosition.update({ where: { id }, data: { name: input.name } });
  }

  async remove(accountId: string, id: string) {
    const row = await this.findOrThrow(accountId, id);
    const assigned = await this.prisma.client.employee.count({
      where: { accountId, position: row.name, archived: false },
    });
    if (assigned > 0) {
      throw new BadRequestException(
        "Bu lavozimga xodimlar biriktirilgan — avval ularni boshqa lavozimga o'tkazing",
      );
    }
    await this.prisma.client.hrPosition.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  private async assertNameFree(accountId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.client.hrPosition.findFirst({
      where: { accountId, name, archived: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new BadRequestException('Bu lavozim allaqachon mavjud');
  }

  private async findOrThrow(accountId: string, id: string) {
    const row = await this.prisma.client.hrPosition.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException('Lavozim topilmadi');
    return row;
  }
}
