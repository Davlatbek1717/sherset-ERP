import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { encryptPassword } from '../email/crypto.js';
import {
  AllocateCodeSchema,
  ApplyCodeSchema,
  ListMarkingCodesSchema,
  MarkSoldSchema,
  SaveMarkingConfigSchema,
  parseGs1DataMatrix,
} from './marking.schema.js';

interface PublicMarkingConfig {
  id: string;
  stir: string;
  apiBaseUrl: string;
  hasApiToken: boolean;
  testMode: boolean;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
}

/**
 * MarkingService — ASL Belgisi (UZ markirovka) integration.
 *
 * V1 scope: full local ledger + GS1 DataMatrix parser + lifecycle FSM.
 * Real provider HTTP calls (allocate from Soliq, verify, retire) are
 * stubbed with placeholder log entries until merchant credentials and
 * the aslbelgisi.uz API contract are wired (operators upload their
 * provider token via the settings UI).
 *
 * The local ledger is real and useful even without provider integration:
 * it's the audit trail of which codes are on which products, when they
 * were sold, and for which retail transaction — required by Soliq for
 * regulated SKUs (alcohol, tobacco, pharma, water, footwear, dairy).
 */
@Injectable()
export class MarkingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- config -----------------------------------------------------------

  async getConfig(accountId: string): Promise<PublicMarkingConfig | null> {
    const row = await this.prisma.client.markingConfig.findUnique({ where: { accountId } });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicMarkingConfig> {
    const r = SaveMarkingConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.markingConfig.findUnique({ where: { accountId } });
    const apiTokenCipher =
      parsed.apiToken && parsed.apiToken.length > 0 ? encryptPassword(parsed.apiToken) : undefined;
    const data = {
      accountId,
      stir: parsed.stir,
      apiBaseUrl: parsed.apiBaseUrl,
      ...(apiTokenCipher !== undefined ? { apiTokenCipher } : {}),
      testMode: parsed.testMode,
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMsg: null,
    };
    const saved = existing
      ? await this.prisma.client.markingConfig.update({ where: { accountId }, data })
      : await this.prisma.client.markingConfig.create({ data });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.markingConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  // --- code lifecycle --------------------------------------------------

  async listCodes(accountId: string, raw: unknown) {
    const filter = ListMarkingCodesSchema.parse(raw);
    const where: Prisma.MarkingCodeRecordWhereInput = {
      accountId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.gtin ? { gtin: filter.gtin } : {}),
      ...(filter.search
        ? {
            OR: [
              { code: { contains: filter.search } },
              { gtin: { contains: filter.search } },
              { serial: { contains: filter.search } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.markingCodeRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, nextCursor };
  }

  /**
   * Register a code as allocated (operator received from ASL Belgisi
   * but hasn't applied to packaging yet).
   */
  async allocate(accountId: string, raw: unknown) {
    const r = AllocateCodeSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const parsedCode = this.parseSafe(parsed.code);
    return this.prisma.client.markingCodeRecord.create({
      data: {
        accountId,
        productId: parsed.productId ?? null,
        variantId: parsed.variantId ?? null,
        code: parsed.code,
        gtin: parsedCode.gtin,
        serial: parsedCode.serial,
        status: 'allocated',
        allocatedAt: new Date(),
      },
    });
  }

  /**
   * Mark a code as 'applied' (printed/affixed onto product packaging).
   * Binds the code to a product if not already bound.
   */
  async applyToProduct(accountId: string, raw: unknown) {
    const r = ApplyCodeSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.markingCodeRecord.findUnique({
      where: { accountId_code: { accountId, code: parsed.code } },
    });
    if (!existing) {
      throw new NotFoundException('Bu kod allokatsiya qilinmagan');
    }
    if (existing.status !== 'allocated' && existing.status !== 'applied') {
      throw new BadRequestException(
        `${existing.status} holatdagi kodni qayta apply qilib bo'lmaydi`,
      );
    }
    return this.prisma.client.markingCodeRecord.update({
      where: { id: existing.id },
      data: {
        productId: parsed.productId,
        status: 'applied',
        appliedAt: new Date(),
      },
    });
  }

  /**
   * Mark a code as 'sold'. Called by RetailDemand or Demand on post.
   * Idempotent — re-marking already-sold returns the existing row.
   */
  async markSold(accountId: string, raw: unknown) {
    const r = MarkSoldSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.markingCodeRecord.findUnique({
      where: { accountId_code: { accountId, code: parsed.code } },
    });
    if (!existing) throw new NotFoundException(`Kod topilmadi: ${parsed.code}`);
    if (existing.status === 'sold') return existing;
    if (existing.status !== 'applied') {
      throw new BadRequestException(
        `${existing.status} holatdagi kodni 'sold' deb belgilab bo'lmaydi`,
      );
    }
    return this.prisma.client.markingCodeRecord.update({
      where: { id: existing.id },
      data: {
        status: 'sold',
        soldAt: new Date(),
        sourceEntity: parsed.sourceEntity,
        sourceEntityId: parsed.sourceEntityId,
      },
    });
  }

  /**
   * Customer return — code goes back to 'returned' state, available
   * for resale via re-applying.
   */
  async markReturned(accountId: string, code: string) {
    const existing = await this.prisma.client.markingCodeRecord.findUnique({
      where: { accountId_code: { accountId, code } },
    });
    if (!existing) throw new NotFoundException(`Kod topilmadi: ${code}`);
    if (existing.status !== 'sold') {
      throw new BadRequestException("Faqat 'sold' kodni qaytaradi");
    }
    return this.prisma.client.markingCodeRecord.update({
      where: { id: existing.id },
      data: { status: 'returned' },
    });
  }

  /** Manual retire — write off / damaged / expired. Terminal. */
  async retire(accountId: string, code: string, reason: string) {
    const existing = await this.prisma.client.markingCodeRecord.findUnique({
      where: { accountId_code: { accountId, code } },
    });
    if (!existing) throw new NotFoundException(`Kod topilmadi: ${code}`);
    if (existing.status === 'retired' || existing.status === 'sold') {
      throw new BadRequestException(
        `${existing.status} holatdagi kodni qayta retire qilib bo'lmaydi`,
      );
    }
    return this.prisma.client.markingCodeRecord.update({
      where: { id: existing.id },
      data: { status: 'retired', errorMsg: reason.slice(0, 500) },
    });
  }

  // --- helpers ----------------------------------------------------------

  private parseSafe(code: string) {
    try {
      return parseGs1DataMatrix(code);
    } catch (e) {
      throw new BadRequestException(`Marking kod noto'g'ri: ${(e as Error).message}`);
    }
  }

  private publicView(row: {
    id: string;
    stir: string;
    apiBaseUrl: string;
    apiTokenCipher: string | null;
    testMode: boolean;
    enabled: boolean;
    lastTestedAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMsg: string | null;
  }): PublicMarkingConfig {
    return {
      id: row.id,
      stir: row.stir,
      apiBaseUrl: row.apiBaseUrl,
      hasApiToken: row.apiTokenCipher !== null && row.apiTokenCipher.length > 0,
      testMode: row.testMode,
      enabled: row.enabled,
      lastTestedAt: row.lastTestedAt,
      lastTestOk: row.lastTestOk,
      lastTestMsg: row.lastTestMsg,
    };
  }
}
