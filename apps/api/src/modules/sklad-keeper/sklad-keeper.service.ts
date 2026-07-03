import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SetReceiptPrinterSchema, UpsertSkladKeeperSchema } from './sklad-keeper.schema.js';

/**
 * SkladKeeperService — manage the sklad(zone)→omborchi assignment table.
 * Tenant-scoped by accountId throughout. The mapping drives picking: see
 * RestockTaskService.createPickingFromCustomerOrder.
 */
@Injectable()
export class SkladKeeperService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    const [items, settings] = await Promise.all([
      this.prisma.client.skladKeeper.findMany({
        where: { accountId },
        orderBy: { skladNo: 'asc' },
      }),
      this.prisma.client.companySettings.findUnique({
        where: { accountId },
        select: { receiptPrinterName: true },
      }),
    ]);
    // receiptPrinterName rides along on the settings list so the sotuv receipt
    // flow and the settings page both read it in one call.
    return { items, receiptPrinterName: settings?.receiptPrinterName ?? null };
  }

  /** Set (or clear) the account-wide customer-receipt printer on CompanySettings. */
  async setReceiptPrinter(accountId: string, raw: unknown) {
    const { printerName } = SetReceiptPrinterSchema.parse(raw);
    const value = printerName?.trim() || null;
    await this.prisma.client.companySettings.upsert({
      where: { accountId },
      create: { accountId, receiptPrinterName: value },
      update: { receiptPrinterName: value },
    });
    return { ok: true, receiptPrinterName: value };
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
