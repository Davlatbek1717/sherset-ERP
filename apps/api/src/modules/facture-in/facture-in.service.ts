import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { type FactureInFilterInput, FactureInFilterSchema } from './facture-in.schema.js';

/**
 * FactureIn read service. moysklad-parity Счета-фактуры полученные
 * list + detail. Sprint 6 ships read-only — the create / post / cancel
 * flow lands when we wire the soliq.uz inbound e-facture sync.
 *
 * Search spans the supplier's printed invoice number + our internal
 * name + agent name so a clerk holding a paper invoice can locate the
 * row regardless of which identifier they remember.
 */
@Injectable()
export class FactureInService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown) {
    const filter = FactureInFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for agent/organization.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.factureIn.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        owner: { select: { id: true, name: true } },
        supply: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.factureIn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror the InvoiceIn /
   * supply gold standard so the FactureIn filter panel reaches moysklad
   * «Счета-фактуры полученные» parity without two-place drift. Keeps the
   * accountId tenant guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: FactureInFilterInput,
  ): Prisma.FactureInWhereInput {
    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.supplyId ? { supplyId: filter.supplyId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { incomingNumber: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      ...(filter.incomingDateFrom || filter.incomingDateTo
        ? {
            incomingDate: tashkentRangeBounds(filter.incomingDateFrom, filter.incomingDateTo),
          }
        : {}),
      ...(filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.factureIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        supply: { select: { id: true, name: true, moment: true, sumMinor: true } },
      },
    });
    if (!row) throw new NotFoundException(`FactureIn ${id} not found`);
    return row;
  }

  /** Doc-number sequence «СФП-YYYY-NNNNN» (полученная — distinct from СФ). */
  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'facturein', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
      const rows = await this.prisma.client.factureIn.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        const m = r.name.match(/\d+$/);
        if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
      }
      return max;
    });
    return String(n).padStart(5, '0');
  }

  /**
   * Generate a draft Счёт-фактура полученный from 1+ source Supplies
   * (moysklad `supplies` array, §66). Mirror of
   * FactureOut.generateFromDemands — same adversarial guards (non-empty
   * unique ids; same agent/org/currency; ≤1 FactureIn per Supply, exact
   * BigInt sum). incomingNumber/Date taken from the first supply.
   */
  async generateFromSupplies(accountId: string, userId: string, supplyIds: string[]) {
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const ids = [...new Set(supplyIds)];
    if (ids.length === 0) throw new BadRequestException('At least one supplyId required');

    const supplies = await this.prisma.client.supply.findMany({
      where: { id: { in: ids }, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        currency: true,
        rateValue: true,
        vatEnabled: true,
        vatIncluded: true,
        sumMinor: true,
        vatSumMinor: true,
        incomingNumber: true,
        incomingDate: true,
      },
    });
    if (supplies.length !== ids.length) {
      throw new NotFoundException('One or more Supplies not found');
    }
    const head = supplies[0];
    if (!head) throw new NotFoundException('One or more Supplies not found');
    for (const s of supplies) {
      if (
        s.agentId !== head.agentId ||
        s.organizationId !== head.organizationId ||
        s.currency !== head.currency
      ) {
        throw new BadRequestException(
          'All supplies must share the same agent, organization and currency',
        );
      }
    }

    const linked = await this.prisma.client.factureInSupply.findFirst({
      where: { accountId, supplyId: { in: ids }, factureIn: { deletedAt: null } },
      select: { factureInId: true },
    });
    const legacy = await this.prisma.client.factureIn.findFirst({
      where: { accountId, supplyId: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const existingId = linked?.factureInId ?? legacy?.id;
    if (existingId) {
      const existing = await this.prisma.client.factureIn.findFirst({
        where: { id: existingId, accountId, deletedAt: null },
        include: { supplyLinks: { select: { supplyId: true } } },
      });
      const linkedSet = new Set([
        ...(existing?.supplyLinks.map((l) => l.supplyId) ?? []),
        ...(existing?.supplyId ? [existing.supplyId] : []),
      ]);
      const sameSet = ids.length === linkedSet.size && ids.every((i) => linkedSet.has(i));
      if (sameSet && existing) return existing;
      throw new BadRequestException('One or more supplies are already on another Счёт-фактура');
    }

    const sumMinor = supplies.reduce((a, s) => a + s.sumMinor, 0n);
    const vatSumMinor = supplies.reduce((a, s) => a + s.vatSumMinor, 0n);
    const name = await this.nextName(accountId);
    return this.prisma.client.factureIn.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: head.agentId,
        organizationId: head.organizationId,
        supplyId: head.id,
        incomingNumber: head.incomingNumber,
        incomingDate: head.incomingDate,
        currency: head.currency,
        rateValue: head.rateValue,
        vatEnabled: head.vatEnabled,
        vatIncluded: head.vatIncluded,
        sumMinor,
        vatSumMinor,
        state: 'draft',
        moment: new Date(),
        supplyLinks: {
          create: supplies.map((s) => ({ accountId, supplyId: s.id })),
        },
      },
    });
  }

  /** Back-compat single-Supply entry point (Chat-3 §82 API). */
  async generateFromSupply(accountId: string, userId: string, supplyId: string) {
    return this.generateFromSupplies(accountId, userId, [supplyId]);
  }

  /**
   * Счёт-фактура полученный на основе «исходящего платежа» (PaymentOut)
   * — captured-reference facturein.json base (§66/§84). Idempotent on
   * paymentOutId.
   */
  async generateFromPaymentOut(accountId: string, userId: string, paymentOutId: string) {
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const pay = await this.prisma.client.paymentOut.findFirst({
      where: { id: paymentOutId, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        currency: true,
        rateValue: true,
        sumMinor: true,
        vatSumMinor: true,
      },
    });
    if (!pay) throw new NotFoundException(`PaymentOut ${paymentOutId} not found`);

    const existing = await this.prisma.client.factureIn.findFirst({
      where: { accountId, paymentOutId, deletedAt: null },
    });
    if (existing) return existing;

    const name = await this.nextName(accountId);
    return this.prisma.client.factureIn.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: pay.agentId,
        organizationId: pay.organizationId,
        paymentOutId: pay.id,
        currency: pay.currency,
        rateValue: pay.rateValue,
        vatEnabled: true,
        vatIncluded: false,
        sumMinor: pay.sumMinor,
        vatSumMinor: pay.vatSumMinor,
        state: 'draft',
        moment: new Date(),
      },
    });
  }
}
