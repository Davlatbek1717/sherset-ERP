import type { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveSaleDebtTermDays } from '../debt/sale-debt-registry.js';
import {
  COMPANY_SETTINGS_DEFAULTS,
  type UpdateCompanySettingsInput,
} from './company-settings.schema.js';

/** Shape the page consumes: payload fields + audit anchor. */
export interface CompanySettingsView extends UpdateCompanySettingsInput {
  /** false while the account has never saved the page (virtual defaults). */
  exists: boolean;
  updatedAt: string | null;
}

/**
 * moysklad «Настройки компании» — singleton row per account (lazy: created on
 * first save; until then GET serves the moysklad-parity defaults).
 *
 * Behaviour consumers today: demand.post reads checkShippingStock (global
 * «Запретить отгрузку» override). The rest are stored for parity; their
 * engines (numbering reset, consignments, recycle bin retention, min-price
 * autoset, reply-address) wire up in follow-up sessions — honest deferral.
 */
@Injectable()
export class CompanySettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(accountId: string): Promise<CompanySettingsView> {
    const row = await this.prisma.client.companySettings.findUnique({
      where: { accountId },
    });
    if (!row) {
      return { ...COMPANY_SETTINGS_DEFAULTS, exists: false, updatedAt: null };
    }
    return {
      globalOperationNumbering: row.globalOperationNumbering,
      emailReplyMode: row.emailReplyMode === 'COMPANY' ? 'COMPANY' : 'EMPLOYEE',
      checkShippingStock: row.checkShippingStock,
      checkMinPrice: row.checkMinPrice,
      useRecycleBin: row.useRecycleBin,
      useConsignments: row.useConsignments,
      showPositionAttributes: row.showPositionAttributes,
      accountCountry: row.accountCountry,
      // Q4 — NULL ≠ 0. Ustun `null` bo'lsa akkaunt hech qachon sozlamagan
      // ⇒ Q1 ning kod-defaulti (14); `0` esa HAQIQIY tanlov bo'lib qaytadi.
      // Yaroqsiz qiymat (faqat qo'lda SQL bilan yozilishi mumkin) ham
      // default'ga tushadi — sof qoida `sale-debt-registry.ts` da.
      saleDebtTermDays: resolveSaleDebtTermDays(row.saleDebtTermDays),
      exists: true,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(
    accountId: string,
    input: UpdateCompanySettingsInput,
    actorId?: string,
  ): Promise<CompanySettingsView> {
    const before = await this.get(accountId);

    await this.prisma.client.companySettings.upsert({
      where: { accountId },
      create: { accountId, ...input },
      update: input,
    });

    // «История изменений» diff (Поле/Было/Стало) — page-level audit anchored
    // on the accountId (stable even across the lazy-create).
    const fieldChanges: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(input) as Array<keyof UpdateCompanySettingsInput>) {
      if (before[key] !== input[key]) {
        fieldChanges[key] = { before: before[key], after: input[key] };
      }
    }
    if (Object.keys(fieldChanges).length > 0) {
      try {
        await this.prisma.client.auditLog.create({
          data: {
            accountId,
            userId: actorId ?? null,
            entity: 'companysettings',
            entityId: accountId,
            action: 'update',
            fieldChanges: fieldChanges as Prisma.InputJsonValue,
          },
        });
      } catch {
        // best-effort — settings write already succeeded
      }
    }

    return this.get(accountId);
  }
}
