import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  CreateHrNotificationTemplateInput,
  HrNotificationDocType,
  HrNotificationEventType,
  UpdateHrNotificationTemplateInput,
} from './hr-notification-template.schema.js';

/**
 * 5 default Telegram notification templates seeded per-account on demand.
 * Eta delimiters: `{{= …}}` (interpolate), `{{ … }}` (logic, unused here).
 * Available render-context paths are documented in template-render.util.ts.
 *
 * Admin can override these via the CRUD endpoints; the seeder is idempotent
 * (UPSERT on `(accountId, docType, eventType)` unique index) and never
 * clobbers customizations.
 */
export const DEFAULT_TEMPLATES: ReadonlyArray<{
  docType: HrNotificationDocType;
  eventType: HrNotificationEventType;
  templateText: string;
}> = [
  {
    docType: 'demand',
    eventType: 'posted',
    templateText:
      "Hurmatli {{= counterparty.name }}, sizga {{= demand.totalFormatted }} so'mlik tovar berildi.\n" +
      "Yangi qarz: {{= balance.formatted }} so'm.",
  },
  {
    docType: 'payment_in',
    eventType: 'posted',
    templateText:
      "Hurmatli {{= counterparty.name }}, sizdan {{= payment.sumFormatted }} so'm to'lov qabul qilindi.\n" +
      "Yangi balans: {{= balance.formatted }} so'm.",
  },
  {
    docType: 'customer_order',
    eventType: 'created',
    templateText:
      'Hurmatli {{= counterparty.name }}, buyurtmangiz qabul qilindi.\n' +
      "Summa: {{= order.totalFormatted }} so'm.",
  },
  {
    docType: 'supply',
    eventType: 'posted',
    templateText:
      "Yetkazib beruvchi {{= counterparty.name }}, sizdan {{= supply.totalFormatted }} so'mlik tovar qabul qilindi.",
  },
  {
    docType: 'sales_return',
    eventType: 'posted',
    templateText:
      'Hurmatli {{= counterparty.name }}, qaytarish qabul qilindi.\n' +
      "Summa: {{= returnDoc.totalFormatted }} so'm.",
  },
];

@Injectable()
export class HrNotificationTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.hrNotificationTemplate.findMany({
      where: { accountId },
      orderBy: [{ docType: 'asc' }, { eventType: 'asc' }],
    });
  }

  async findOne(accountId: string, id: string) {
    const row = await this.prisma.client.hrNotificationTemplate.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Bildirishnoma shabloni topilmadi');
    return row;
  }

  /**
   * Look up the active template for a (docType, eventType). Listeners call
   * this on each event — null result → no notification will be sent.
   */
  async findActive(
    accountId: string,
    docType: HrNotificationDocType,
    eventType: HrNotificationEventType,
  ) {
    return this.prisma.client.hrNotificationTemplate.findFirst({
      where: { accountId, docType, eventType, isActive: true },
    });
  }

  async create(accountId: string, input: CreateHrNotificationTemplateInput) {
    const existing = await this.prisma.client.hrNotificationTemplate.findFirst({
      where: { accountId, docType: input.docType, eventType: input.eventType },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `(${input.docType}/${input.eventType}) uchun shablon allaqachon mavjud — tahrirlash kerak`,
      );
    }
    return this.prisma.client.hrNotificationTemplate.create({
      data: {
        accountId,
        docType: input.docType,
        eventType: input.eventType,
        templateText: input.templateText,
        isActive: input.isActive ?? true,
        largeSaleMinThreshold:
          input.largeSaleMinThresholdMinor != null
            ? BigInt(input.largeSaleMinThresholdMinor)
            : null,
      },
    });
  }

  async update(accountId: string, id: string, input: UpdateHrNotificationTemplateInput) {
    await this.findOne(accountId, id);
    return this.prisma.client.hrNotificationTemplate.update({
      where: { id },
      data: {
        ...(input.docType !== undefined && { docType: input.docType }),
        ...(input.eventType !== undefined && { eventType: input.eventType }),
        ...(input.templateText !== undefined && { templateText: input.templateText }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.largeSaleMinThresholdMinor !== undefined && {
          largeSaleMinThreshold:
            input.largeSaleMinThresholdMinor === null
              ? null
              : BigInt(input.largeSaleMinThresholdMinor),
        }),
      },
    });
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(accountId, id);
    await this.prisma.client.hrNotificationTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Seed the 5 default templates for an account. Idempotent — already-present
   * (accountId, docType, eventType) rows are left untouched so admin
   * customizations survive re-seed.
   */
  async seedDefaults(accountId: string): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.client.hrNotificationTemplate.findFirst({
        where: { accountId, docType: tpl.docType, eventType: tpl.eventType },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.client.hrNotificationTemplate.create({
        data: {
          accountId,
          docType: tpl.docType,
          eventType: tpl.eventType,
          templateText: tpl.templateText,
          isActive: true,
        },
      });
      inserted++;
    }
    return { inserted, skipped };
  }
}
