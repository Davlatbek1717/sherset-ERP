import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpsertSkladKeeperSchema } from './sklad-keeper.schema.js';

/**
 * SkladKeeperService — manage the sklad(zone)→omborchi assignment table.
 * Tenant-scoped by accountId throughout. The mapping drives picking: see
 * RestockTaskService.createPickingFromCustomerOrder.
 */
@Injectable()
export class SkladKeeperService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    const items = await this.prisma.client.skladKeeper.findMany({
      where: { accountId },
      orderBy: { skladNo: 'asc' },
    });
    return { items };
  }

  /** Upsert (or clear, when employeeId is null) one sklad→keeper mapping. */
  async upsert(accountId: string, raw: unknown) {
    const input = UpsertSkladKeeperSchema.parse(raw);

    if (!input.employeeId) {
      await this.prisma.client.skladKeeper.deleteMany({
        where: { accountId, skladNo: input.skladNo },
      });
      return { ok: true, deleted: true };
    }

    const emp = await this.prisma.client.employee.findFirst({
      where: { id: input.employeeId, accountId },
      select: { id: true, name: true },
    });
    if (!emp) throw new BadRequestException('Omborchi (xodim) topilmadi');

    return this.prisma.client.skladKeeper.upsert({
      where: { accountId_skladNo: { accountId, skladNo: input.skladNo } },
      create: {
        accountId,
        skladNo: input.skladNo,
        employeeId: emp.id,
        employeeName: emp.name,
      },
      update: { employeeId: emp.id, employeeName: emp.name },
    });
  }

  async remove(accountId: string, skladNo: number) {
    await this.prisma.client.skladKeeper.deleteMany({ where: { accountId, skladNo } });
    return { ok: true };
  }
}
