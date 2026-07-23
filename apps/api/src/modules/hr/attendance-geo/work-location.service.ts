import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { type WorkLocationInput, WorkLocationSchema } from './attendance-geo.schema.js';

/** Work-location (filial) geofence CRUD. Soft-delete; blocks delete while assigned. */
@Injectable()
export class HrWorkLocationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, includeArchived = false) {
    const rows = await this.prisma.client.hrWorkLocation.findMany({
      where: { accountId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      radiusMeters: r.radiusMeters,
      archived: r.archived,
      employeeCount: r._count.employees,
    }));
  }

  async create(accountId: string, raw: unknown) {
    const data = WorkLocationSchema.parse(raw) as WorkLocationInput;
    return this.prisma.client.hrWorkLocation.create({ data: { accountId, ...data } });
  }

  async update(accountId: string, id: string, raw: unknown) {
    await this.findOrThrow(accountId, id);
    const data = WorkLocationSchema.partial().parse(raw);
    return this.prisma.client.hrWorkLocation.update({ where: { id }, data });
  }

  async remove(accountId: string, id: string) {
    await this.findOrThrow(accountId, id);
    const assigned = await this.prisma.client.employee.count({
      where: { accountId, workLocationId: id },
    });
    if (assigned > 0) {
      throw new BadRequestException(
        "Bu filialga xodimlar biriktirilgan — avval ularni boshqa filialga o'tkazing",
      );
    }
    await this.prisma.client.hrWorkLocation.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  private async findOrThrow(accountId: string, id: string) {
    const row = await this.prisma.client.hrWorkLocation.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException('Filial topilmadi');
    return row;
  }
}
