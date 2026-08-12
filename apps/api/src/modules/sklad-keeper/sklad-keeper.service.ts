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

  // Ilgari bu yerda `CompanySettings.receiptPrinterName` ham o'qilardi va
  // javobga qo'shib yuborilardi (mijoz cheki printeri). Akkaunt-darajali chek
  // printeri butunlay olib tashlandi — chek endi qurilmaning Windows sukut
  // printeriga bosiladi (desktop v1.4.0+). Bu yerda faqat ombor→omborchi
  // (va ombor→printer) biriktirmasi qoladi: u yig'ish varag'iniki.
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
        printerName: input.printerName ?? null,
      },
      // printerName only overwritten when the caller sent the field (undefined =
      // leave as-is, so editing the keeper alone doesn't wipe the printer).
      update: {
        employeeId: emp.id,
        employeeName: emp.name,
        ...(input.printerName !== undefined ? { printerName: input.printerName } : {}),
      },
    });
  }

  async remove(accountId: string, skladNo: number) {
    await this.prisma.client.skladKeeper.deleteMany({ where: { accountId, skladNo } });
    return { ok: true };
  }
}
