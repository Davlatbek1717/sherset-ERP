import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptPassword } from '../../email/crypto.js';
import {
  ListMarketplaceOrdersSchema,
  RecordMarketplaceOrderSchema,
  SaveMarketplaceConfigSchema,
} from './marketplace.schema.js';

interface PublicMarketplaceConfig {
  id: string;
  marketplace: string;
  shopName: string;
  sellerId: string;
  apiBaseUrl: string;
  hasCreds: boolean;
  enabled: boolean;
  lastCatalogPushAt: Date | null;
  lastOrderPullAt: Date | null;
}

/**
 * MarketplaceService — Uzum/Yandex/WB/Ozon seller config + inbound order
 * registry.
 *
 * V1 ships:
 *   - Per-(account,marketplace) config CRUD with AES-encrypted creds
 *   - Order ingestion endpoint (record + idempotent upsert by externalId)
 *   - Materialisation hook (downstream RetailService picks unprocessed
 *     rows, creates CustomerOrder, sets internalOrderId)
 *
 * Per-marketplace HTTP adapters (Uzum/Yandex/WB/Ozon API clients) follow
 * in Sprint 32b — V1 records orders that are pushed to us by external
 * pollers, plus exposes the raw upsert path for testing.
 */
@Injectable()
export class MarketplaceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // --- config ----------------------------------------------------------

  async listConfigs(accountId: string): Promise<PublicMarketplaceConfig[]> {
    const rows = await this.prisma.client.marketplaceConfig.findMany({
      where: { accountId },
      orderBy: { marketplace: 'asc' },
    });
    return rows.map((r) => this.publicView(r));
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicMarketplaceConfig> {
    const r = SaveMarketplaceConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.marketplaceConfig.findUnique({
      where: { accountId_marketplace: { accountId, marketplace: parsed.marketplace } },
    });
    const credsCipher = parsed.creds ? encryptPassword(JSON.stringify(parsed.creds)) : undefined;
    if (!credsCipher && !existing) {
      throw new BadRequestException('Birinchi sozlash uchun creds majburiy');
    }
    const data = {
      accountId,
      marketplace: parsed.marketplace,
      shopName: parsed.shopName,
      sellerId: parsed.sellerId,
      apiBaseUrl: parsed.apiBaseUrl,
      ...(credsCipher !== undefined ? { credsCipher } : {}),
    };
    const saved = existing
      ? await this.prisma.client.marketplaceConfig.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.client.marketplaceConfig.create({
          data: { ...data, credsCipher: credsCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string, marketplace: string): Promise<{ ok: true }> {
    await this.prisma.client.marketplaceConfig.deleteMany({
      where: { accountId, marketplace },
    });
    return { ok: true };
  }

  // --- orders ---------------------------------------------------------

  async listOrders(accountId: string, raw: unknown) {
    const filter = ListMarketplaceOrdersSchema.parse(raw);
    const where: Prisma.MarketplaceOrderRowWhereInput = {
      accountId,
      ...(filter.marketplace ? { marketplace: filter.marketplace } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.unprocessed !== undefined &&
      (filter.unprocessed === true || filter.unprocessed === 'true')
        ? { internalOrderId: null }
        : {}),
    };
    const rows = await this.prisma.client.marketplaceOrderRow.findMany({
      where,
      orderBy: { pulledAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, nextCursor };
  }

  async findOrder(accountId: string, id: string) {
    const row = await this.prisma.client.marketplaceOrderRow.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`MarketplaceOrder ${id} not found`);
    return row;
  }

  /**
   * Upsert an inbound order from a marketplace. Idempotent on
   * (account, marketplace, externalId). Status changes refresh the row;
   * raw payload is replaced.
   */
  async recordOrder(accountId: string, raw: unknown) {
    const r = RecordMarketplaceOrderSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    return this.prisma.client.marketplaceOrderRow.upsert({
      where: {
        accountId_marketplace_externalId: {
          accountId,
          marketplace: parsed.marketplace,
          externalId: parsed.externalId,
        },
      },
      create: {
        accountId,
        marketplace: parsed.marketplace,
        externalId: parsed.externalId,
        status: parsed.status,
        totalMinor: BigInt(parsed.totalMinor),
        currency: parsed.currency,
        rawJson: parsed.rawJson as Prisma.InputJsonValue,
      },
      update: {
        status: parsed.status,
        totalMinor: BigInt(parsed.totalMinor),
        rawJson: parsed.rawJson as Prisma.InputJsonValue,
      },
    });
  }

  /** Mark a row as materialised into our CustomerOrder. */
  async linkInternalOrder(accountId: string, id: string, internalOrderId: string) {
    await this.findOrder(accountId, id);
    return this.prisma.client.marketplaceOrderRow.update({
      where: { id },
      data: { internalOrderId },
    });
  }

  private publicView(row: {
    id: string;
    marketplace: string;
    shopName: string;
    sellerId: string;
    apiBaseUrl: string;
    credsCipher: string;
    enabled: boolean;
    lastCatalogPushAt: Date | null;
    lastOrderPullAt: Date | null;
  }): PublicMarketplaceConfig {
    return {
      id: row.id,
      marketplace: row.marketplace,
      shopName: row.shopName,
      sellerId: row.sellerId,
      apiBaseUrl: row.apiBaseUrl,
      hasCreds: row.credsCipher.length > 0,
      enabled: row.enabled,
      lastCatalogPushAt: row.lastCatalogPushAt,
      lastOrderPullAt: row.lastOrderPullAt,
    };
  }
}
