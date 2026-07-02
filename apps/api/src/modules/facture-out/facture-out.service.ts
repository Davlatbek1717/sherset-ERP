import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { type FactureOutFilterInput, FactureOutFilterSchema } from './facture-out.schema.js';

/**
 * FactureOut read service. moysklad-parity Счета-фактуры выданные
 * list + detail. Sprint 5 scope is read-only — the create/update/
 * cancel flow lands once the soliq.uz e-facture sync is wired.
 */
@Injectable()
export class FactureOutService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown) {
    const filter = FactureOutFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for agent/organization.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.factureOut.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        owner: { select: { id: true, name: true } },
        demand: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.factureOut.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad list footer «Итого» — sums the ENTIRE filtered set (all pages), not
   * just the current page (the page-summed footer was wrong past row 100). Mirrors
   * invoice-out/demand. `currencies` lets the UI show «—» on a mixed-currency set.
   * FactureOut carries only Сумма (+ vat) — no payed/shipped on this doc.
   */
  async aggregateTotals(accountId: string, raw: unknown) {
    const filter = FactureOutFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);
    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.factureOut.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
        },
      }),
      this.prisma.client.factureOut.groupBy({ by: ['currency'], where }),
    ]);
    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror the InvoiceOut /
   * supply gold standard so the FactureOut filter panel reaches moysklad
   * «Счета-фактуры выданные» parity without two-place drift. Keeps the
   * accountId tenant guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: FactureOutFilterInput,
  ): Prisma.FactureOutWhereInput {
    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.demandId ? { demandId: filter.demandId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
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
    const row = await this.prisma.client.factureOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        demand: { select: { id: true, name: true, moment: true, sumMinor: true } },
      },
    });
    if (!row) throw new NotFoundException(`FactureOut ${id} not found`);
    return row;
  }

  /** Doc-number sequence «СФ-YYYY-NNNNN» (mirrors nextSupplyName). */
  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'factureout',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.factureOut.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          const m = r.name.match(/\d+$/);
          if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
        }
        return max;
      },
    );
    return String(n).padStart(5, '0');
  }

  /**
   * Generate a draft Счёт-фактура from 1+ source Demands (moysklad
   * `demands` array, §66). Header refs copied losslessly (§8.3): agent/
   * organization/currency/rate/VAT config; sumMinor/vatSumMinor are the
   * EXACT BigInt sum across the demands. The canonical link is the
   * FactureOutDemand join (all demands); `demandId` mirrors the first
   * (denormalised primary, back-compat).
   *
   * Adversarial guards (money/parity correctness — CLAUDE.md):
   *  - ids must be non-empty and unique;
   *  - every demand must exist, same account, and share agent +
   *    organization + currency (can't fold cross-agent/currency into
   *    one tax invoice) — else BadRequest;
   *  - a Demand belongs to ≤1 FactureOut: a repeat call with the SAME
   *    set returns the existing facture (idempotent); any PARTIAL
   *    overlap with an existing facture is rejected (no double-facture).
   */
  async generateFromDemands(accountId: string, userId: string, demandIds: string[]) {
    const ids = [...new Set(demandIds)];
    if (ids.length === 0) throw new BadRequestException('At least one demandId required');

    const demands = await this.prisma.client.demand.findMany({
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
      },
    });
    if (demands.length !== ids.length) {
      throw new NotFoundException('One or more Demands not found');
    }
    const head = demands[0];
    if (!head) throw new NotFoundException('One or more Demands not found');
    for (const d of demands) {
      if (
        d.agentId !== head.agentId ||
        d.organizationId !== head.organizationId ||
        d.currency !== head.currency
      ) {
        throw new BadRequestException(
          'All demands must share the same agent, organization and currency',
        );
      }
    }

    // Idempotent / no-double-facture: is any of these demands already
    // on a (non-deleted) FactureOut — via the join or the legacy
    // singular pointer?
    const linked = await this.prisma.client.factureOutDemand.findFirst({
      where: { accountId, demandId: { in: ids }, factureOut: { deletedAt: null } },
      select: { factureOutId: true },
    });
    const legacy = await this.prisma.client.factureOut.findFirst({
      where: { accountId, demandId: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const existingId = linked?.factureOutId ?? legacy?.id;
    if (existingId) {
      const existing = await this.prisma.client.factureOut.findFirst({
        where: { id: existingId, accountId, deletedAt: null },
        include: { demandLinks: { select: { demandId: true } } },
      });
      const linkedSet = new Set([
        ...(existing?.demandLinks.map((l) => l.demandId) ?? []),
        ...(existing?.demandId ? [existing.demandId] : []),
      ]);
      const sameSet = ids.length === linkedSet.size && ids.every((i) => linkedSet.has(i));
      if (sameSet && existing) return existing;
      throw new BadRequestException('One or more demands are already on another Счёт-фактура');
    }

    const sumMinor = demands.reduce((a, d) => a + d.sumMinor, 0n);
    const vatSumMinor = demands.reduce((a, d) => a + d.vatSumMinor, 0n);
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    return this.prisma.client.factureOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: head.agentId,
        organizationId: head.organizationId,
        demandId: head.id,
        currency: head.currency,
        rateValue: head.rateValue,
        vatEnabled: head.vatEnabled,
        vatIncluded: head.vatIncluded,
        sumMinor,
        vatSumMinor,
        state: 'draft',
        moment: new Date(),
        demandLinks: {
          create: demands.map((d) => ({ accountId, demandId: d.id })),
        },
      },
    });
  }

  /**
   * Back-compat single-Demand entry point (Chat-3 §82 API + controller
   * `POST /generate {demandId}`). Delegates to the canonical
   * multi-source path with a 1-element set.
   */
  async generateFromDemand(accountId: string, userId: string, demandId: string) {
    return this.generateFromDemands(accountId, userId, [demandId]);
  }

  /**
   * Счёт-фактура на основе «возврата поставщику» (PurchaseReturn) —
   * captured-reference factureout.json base (§66/§84). Idempotent on
   * purchaseReturnId.
   */
  async generateFromPurchaseReturn(accountId: string, userId: string, purchaseReturnId: string) {
    const pr = await this.prisma.client.purchaseReturn.findFirst({
      where: { id: purchaseReturnId, accountId, deletedAt: null },
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
      },
    });
    if (!pr) throw new NotFoundException(`PurchaseReturn ${purchaseReturnId} not found`);

    const existing = await this.prisma.client.factureOut.findFirst({
      where: { accountId, purchaseReturnId, deletedAt: null },
    });
    if (existing) return existing;

    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    return this.prisma.client.factureOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: pr.agentId,
        organizationId: pr.organizationId,
        purchaseReturnId: pr.id,
        currency: pr.currency,
        rateValue: pr.rateValue,
        vatEnabled: pr.vatEnabled,
        vatIncluded: pr.vatIncluded,
        sumMinor: pr.sumMinor,
        vatSumMinor: pr.vatSumMinor,
        state: 'draft',
        moment: new Date(),
      },
    });
  }

  /**
   * Авансовая Счёт-фактура на основе «входящего платежа» (PaymentIn) —
   * captured-reference base (§66/§84). `advanceVatRate` («Ставка НДС
   * для авансового платежа») is payment-facture-only. Idempotent on
   * paymentInId.
   */
  async generateFromPaymentIn(
    accountId: string,
    userId: string,
    paymentInId: string,
    advanceVatRate?: number,
  ) {
    const pay = await this.prisma.client.paymentIn.findFirst({
      where: { id: paymentInId, accountId, deletedAt: null },
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
    if (!pay) throw new NotFoundException(`PaymentIn ${paymentInId} not found`);

    const existing = await this.prisma.client.factureOut.findFirst({
      where: { accountId, paymentInId, deletedAt: null },
    });
    if (existing) return existing;

    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    return this.prisma.client.factureOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: pay.agentId,
        organizationId: pay.organizationId,
        paymentInId: pay.id,
        advanceVatRate: advanceVatRate ?? null,
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
