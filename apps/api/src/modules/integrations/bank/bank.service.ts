import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptPassword } from '../../email/crypto.js';
import { SaveBankApiConfigSchema } from './bank.schema.js';

interface PublicBankApiConfig {
  id: string;
  bankCode: string;
  stir: string;
  bankAccount: string;
  bankMfo: string;
  apiBaseUrl: string;
  hasCreds: boolean;
  enabled: boolean;
  lastPullAt: Date | null;
  lastPullOk: boolean | null;
  lastPullMsg: string | null;
}

/**
 * BankService — multi-bank config registry. UZ banks each have their
 * own auth/format quirks; this service stores the per-tenant config
 * and a generic `BankAdapter` interface. Concrete adapters (NbuAdapter,
 * AsakaAdapter, ...) follow in subsequent commits — V1 ships the
 * registry only so operators can capture credentials and the BankImport
 * UI has data to render.
 */
@Injectable()
export class BankService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listConfigs(accountId: string): Promise<PublicBankApiConfig[]> {
    const rows = await this.prisma.client.bankApiConfig.findMany({
      where: { accountId },
      orderBy: { bankCode: 'asc' },
    });
    return rows.map((r) => this.publicView(r));
  }

  async findConfig(accountId: string, id: string): Promise<PublicBankApiConfig> {
    const row = await this.prisma.client.bankApiConfig.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new BadRequestException(`BankApiConfig ${id} topilmadi`);
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicBankApiConfig> {
    const r = SaveBankApiConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.bankApiConfig.findFirst({
      where: {
        accountId,
        bankCode: parsed.bankCode,
        bankAccount: parsed.bankAccount,
      },
    });
    const credsCipher = parsed.creds ? encryptPassword(JSON.stringify(parsed.creds)) : undefined;
    if (!credsCipher && !existing) {
      throw new BadRequestException('Birinchi sozlash uchun creds majburiy');
    }
    const data = {
      accountId,
      bankCode: parsed.bankCode,
      stir: parsed.stir,
      bankAccount: parsed.bankAccount,
      bankMfo: parsed.bankMfo,
      apiBaseUrl: parsed.apiBaseUrl,
      ...(credsCipher !== undefined ? { credsCipher } : {}),
    };
    const saved = existing
      ? await this.prisma.client.bankApiConfig.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.client.bankApiConfig.create({
          data: { ...data, credsCipher: credsCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findConfig(accountId, id);
    await this.prisma.client.bankApiConfig.delete({ where: { id } });
    return { ok: true };
  }

  private publicView(row: {
    id: string;
    bankCode: string;
    stir: string;
    bankAccount: string;
    bankMfo: string;
    apiBaseUrl: string;
    credsCipher: string;
    enabled: boolean;
    lastPullAt: Date | null;
    lastPullOk: boolean | null;
    lastPullMsg: string | null;
  }): PublicBankApiConfig {
    return {
      id: row.id,
      bankCode: row.bankCode,
      stir: row.stir,
      bankAccount: row.bankAccount,
      bankMfo: row.bankMfo,
      apiBaseUrl: row.apiBaseUrl,
      hasCreds: row.credsCipher.length > 0,
      enabled: row.enabled,
      lastPullAt: row.lastPullAt,
      lastPullOk: row.lastPullOk,
      lastPullMsg: row.lastPullMsg,
    };
  }
}
