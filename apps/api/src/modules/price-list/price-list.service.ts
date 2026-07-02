import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreatePriceListSchema,
  type PriceListFilterInput,
  PriceListFilterSchema,
  type PricesSnapshot,
  UpdatePriceListSchema,
} from './price-list.schema.js';

/**
 * PriceList service.
 *
 * No financial side effects (no balance, no stock). The document is a
 * publication artifact. Posting just toggles `applicable=true` so the
 * snapshot is treated as the "current" published list by exporters.
 * Editing posted lists is allowed via unpost-then-edit; the cancel state
 * keeps the row for audit but signals it's no longer the live publication.
 */
@Injectable()
export class PriceListService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown) {
    const filter = PriceListFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization (the list-view
    // exposes the column header as sortable). Mirror move.service.ts.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.priceList.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        priceType: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.priceList.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror move.service.ts
   * so the PriceList filter panel reaches moysklad «Прайс-листы» parity
   * without two-place drift. Preserves the accountId tenant guard +
   * deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: PriceList is a snapshot publication artifact — NO agentId,
   * agentAccountId, contractId, organizationAccountId, salesChannelId,
   * storeId, projectId, or sumMinor. DO NOT add those clauses.
   */
  private buildListWhere(
    accountId: string,
    filter: PriceListFilterInput,
  ): Prisma.PriceListWhereInput {
    const momentRange =
      filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {};
    const updatedRange =
      filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {};

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.priceTypeId ? { priceTypeId: filter.priceTypeId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...momentRange,
      ...updatedRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.priceList.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        priceType: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`PriceList ${id} not found`);
    return row;
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreatePriceListSchema.parse(raw);
    // The unique constraint is (accountId, name) so we let the user
    // supply the display name. No auto-numbering — moysklad's UI lets
    // you name a price list freely (e.g. "Sales prices 2026-Q2 v3").
    const moment = data.moment ? new Date(data.moment) : new Date();
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    const created = await this.prisma.client.priceList.create({
      data: {
        accountId,
        ownerId,
        groupId: creatorGroupId,
        name: data.name,
        code: data.code,
        externalCode: data.externalCode,
        organizationId: data.organizationId,
        priceTypeId: data.priceTypeId ?? null,
        moment,
        applicable,
        state,
        pricesJson: data.pricesJson as unknown as Prisma.InputJsonValue,
        currency: data.currency,
        rateValue: BigInt(data.rateValue),
        description: data.description,
      },
    });
    await this.logAudit(accountId, ownerId, 'create', created.id, null);
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdatePriceListSchema.parse(raw);
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }
    try {
      // Optimistic lock: the version filter matches only if no concurrent write
      // bumped the version since the form loaded. findById above proves the row
      // exists, so a P2025 here is a concurrency conflict, not a missing row.
      const updated = await this.prisma.client.priceList.update({
        where: { id, accountId, version: data.version },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(data.organizationId ? { organizationId: data.organizationId } : {}),
          ...(data.priceTypeId !== undefined ? { priceTypeId: data.priceTypeId ?? null } : {}),
          ...(data.moment ? { moment: new Date(data.moment) } : {}),
          ...(data.pricesJson
            ? { pricesJson: data.pricesJson as unknown as Prisma.InputJsonValue }
            : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.rateValue ? { rateValue: BigInt(data.rateValue) } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          version: { increment: 1 },
        },
        include: { organization: true, priceType: true },
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'PriceList');
      throw e;
    }
  }

  async softDelete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.priceList.update({
      where: { id },
      data: { applicable: false, state: 'cancelled', deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  /** mass-edit single-row apply. PriceList has no projectId column. */
  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.priceList.update({ where: { id, accountId }, data });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.priceList.update({
      where: { id, accountId },
      data: { printed },
    });
  }

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    return this.create(accountId, ownerId, {
      name: `${src.name} (copy)`,
      // moysklad «Скопировать» preserves all header fields (§8.3/§39).
      // `code` and the universal «Внешний код» were dropped (lossy clone)
      // — both are accepted by CreatePriceListSchema and on the model.
      code: src.code ?? undefined,
      externalCode: src.externalCode ?? undefined,
      organizationId: src.organizationId,
      priceTypeId: src.priceTypeId,
      pricesJson: (src.pricesJson as unknown as PricesSnapshot) ?? {},
      currency: src.currency,
      rateValue: src.rateValue.toString(),
      description: src.description ?? undefined,
      applicable: false,
    });
  }

  async transition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    const row = await this.findById(accountId, id);
    if (target === 'post') {
      if (row.applicable) throw new BadRequestException('Already posted');
      await this.prisma.client.priceList.update({
        where: { id },
        data: { applicable: true, state: 'posted' },
      });
      await this.logAudit(accountId, userId, 'transition:posted', id, {
        from: { before: row.state, after: 'posted' },
      });
    } else if (target === 'unpost') {
      if (!row.applicable) throw new BadRequestException('Not posted');
      await this.prisma.client.priceList.update({
        where: { id },
        data: { applicable: false, state: 'draft' },
      });
      await this.logAudit(accountId, userId, 'transition:unposted', id, {
        from: { before: row.state, after: 'draft' },
      });
    } else if (target === 'cancel') {
      await this.prisma.client.priceList.update({
        where: { id },
        data: { applicable: false, state: 'cancelled' },
      });
      await this.logAudit(accountId, userId, 'transition:cancelled', id, {
        from: { before: row.state, after: 'cancelled' },
      });
    }
    return this.findById(accountId, id);
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * The tab fetches /audit-logs?entity=PriceList (exact-match the web page's
   * auditEntity="PriceList"), so this `entity` string MUST stay in sync or
   * the tab renders empty. Non-transactional: PriceList is a publication
   * artifact with no balance/stock side effects, so the audit row needs no
   * atomic delta.
   */
  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'PriceList',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
