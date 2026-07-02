import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

/** Phone → opaque serialized entity. Stored as Prisma Json column. */
type EntityMap = Record<string, Prisma.InputJsonValue>;

/**
 * MTProto entity cache. gramjs needs an "entity" object (resolved peer
 * record) to send a message — looking it up via `client.getEntity(phone)`
 * costs a network round-trip and counts against rate limits. Yangibolim
 * persisted these on disk (`data/entity_cache.json`); we persist per
 * `(accountId, slot)` in HrTelegramSession under key='entity_cache' so
 * the cache survives restart and is RLS-scoped.
 *
 * Value shape: { [phone]: serializedEntity } where `serializedEntity` is
 * whatever the adapter wants to round-trip (we store opaque; adapter
 * decides). Phone keys are normalized to +998… by the upstream
 * `normalizeTelegramPhone` util, so the cache is collision-free.
 */
@Injectable()
export class HrTelegramEntityCacheService {
  private readonly logger = new Logger(HrTelegramEntityCacheService.name);
  static readonly KEY = 'entity_cache';

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Returns the cached serialized entity for `phone`, or null on miss. */
  async get(accountId: string, slot: number, phone: string): Promise<unknown | null> {
    const row = await this.prisma.client.hrTelegramSession.findUnique({
      where: {
        accountId_accountSlot_key: {
          accountId,
          accountSlot: slot,
          key: HrTelegramEntityCacheService.KEY,
        },
      },
      select: { value: true },
    });
    if (!row) return null;
    const map = row.value as Record<string, unknown> | null;
    if (!map || typeof map !== 'object') return null;
    return map[phone] ?? null;
  }

  /**
   * Upsert the (accountId, slot) cache row, merging the new entry into the
   * existing map. Concurrent writes on the same row race, but the cost of
   * a lost cache write is one extra `getEntity` next time — acceptable.
   */
  async set(
    accountId: string,
    slot: number,
    phone: string,
    entity: Prisma.InputJsonValue,
  ): Promise<void> {
    const existing = await this.prisma.client.hrTelegramSession.findUnique({
      where: {
        accountId_accountSlot_key: {
          accountId,
          accountSlot: slot,
          key: HrTelegramEntityCacheService.KEY,
        },
      },
      select: { value: true },
    });
    const previousMap = (existing?.value as EntityMap | null | undefined) ?? {};
    const merged: EntityMap = { ...previousMap, [phone]: entity };

    await this.prisma.client.hrTelegramSession.upsert({
      where: {
        accountId_accountSlot_key: {
          accountId,
          accountSlot: slot,
          key: HrTelegramEntityCacheService.KEY,
        },
      },
      create: {
        accountId,
        accountSlot: slot,
        key: HrTelegramEntityCacheService.KEY,
        value: merged,
      },
      update: { value: merged },
    });
  }

  /** Drop the entire cache for (accountId, slot) — e.g. on session re-login. */
  async clear(accountId: string, slot: number): Promise<void> {
    try {
      await this.prisma.client.hrTelegramSession.delete({
        where: {
          accountId_accountSlot_key: {
            accountId,
            accountSlot: slot,
            key: HrTelegramEntityCacheService.KEY,
          },
        },
      });
    } catch (e) {
      // Already missing → fine (idempotent).
      this.logger.debug(`entity cache clear no-op: ${(e as Error).message}`);
    }
  }

  /** Drop a single phone entry (e.g. when the peer phone changes). */
  async invalidate(accountId: string, slot: number, phone: string): Promise<void> {
    const existing = await this.prisma.client.hrTelegramSession.findUnique({
      where: {
        accountId_accountSlot_key: {
          accountId,
          accountSlot: slot,
          key: HrTelegramEntityCacheService.KEY,
        },
      },
      select: { value: true },
    });
    if (!existing) return;
    const map = (existing.value as EntityMap | null | undefined) ?? {};
    if (!(phone in map)) return;
    const next: EntityMap = { ...map };
    delete next[phone];
    await this.prisma.client.hrTelegramSession.update({
      where: {
        accountId_accountSlot_key: {
          accountId,
          accountSlot: slot,
          key: HrTelegramEntityCacheService.KEY,
        },
      },
      data: { value: next },
    });
  }
}
