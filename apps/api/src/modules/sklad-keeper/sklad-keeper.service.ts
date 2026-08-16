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

  // 🔴 PRINTER SOZLAMASI BU MODULDA YO'Q (egasi, 2026-08-16): avval
  // akkaunt-darajali chek printeri (2026-08-12), endi ombor→printer marshruti
  // ham olib tashlandi — har qurilma O'ZIGA ulangan printerdan chiqaradi.
  // Qoladigan yagona narsa — ombor→omborchi biriktirmasi (VAZIFA uchun).
  //
  // Maydonlar OSHKORA sanaladi: `printer_name` ustuni bazada hamon bor
  // (o'chirish migratsiya talab qiladi), `findMany` esa uni jimgina javobga
  // qo'shib yuborardi va o'lik sozlama mijozga qaytib kelaverardi.
  async list(accountId: string) {
    const items = await this.prisma.client.skladKeeper.findMany({
      where: { accountId },
      orderBy: { skladNo: 'asc' },
      select: {
        id: true,
        skladNo: true,
        employeeId: true,
        employeeName: true,
        createdAt: true,
        updatedAt: true,
      },
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
      update: {
        employeeId: emp.id,
        employeeName: emp.name,
      },
    });
  }

  async remove(accountId: string, skladNo: number) {
    await this.prisma.client.skladKeeper.deleteMany({ where: { accountId, skladNo } });
    return { ok: true };
  }
}
