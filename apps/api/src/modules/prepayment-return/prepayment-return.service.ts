import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import {
  CreatePrepaymentReturnSchema,
  PrepaymentReturnFilterSchema,
  UpdatePrepaymentReturnSchema,
} from './prepayment-return.schema.js';

/**
 * PrepaymentReturn service — inverse of Prepayment.
 *
 * Balance impact:
 *   post   → +sumMinor (we returned money to customer)
 *   unpost → −sumMinor (reverse)
 *
 * Invariant: sum of `applicable=true` returns for a given prepaymentId
 * must NEVER exceed the source Prepayment.sumMinor. Enforced inside the
 * transaction so concurrent posts can't slip past the cap.
 */
@Injectable()
export class PrepaymentReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyBalanceService)
    private readonly balances: CounterpartyBalanceService,
  ) {}

  async list(accountId: string, raw: unknown) {
    const filter = PrepaymentReturnFilterSchema.parse(raw);
    const where: Prisma.PrepaymentReturnWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.prepaymentId ? { prepaymentId: filter.prepaymentId } : {}),
      ...(filter.retailShiftId ? { retailShiftId: filter.retailShiftId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
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
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.client.prepaymentReturn.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true } },
        prepayment: { select: { id: true, name: true, sumMinor: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.prepaymentReturn.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.prepaymentReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        prepayment: { select: { id: true, name: true, sumMinor: true, state: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`PrepaymentReturn ${id} not found`);
    // «Остаток к возврату» — how much of the source advance is STILL refundable:
    // source.sumMinor − Σ(other applicable, non-deleted returns for the same
    // prepayment, excluding THIS row). Mirrors assertWithinPrepaymentCap so the
    // figure the detail page shows equals the cap the post-time guard enforces
    // (was previously the full source sum, which contradicts its own label once
    // a partial return exists). BigInt → string via the global toJSON. (2026-06-03g)
    let prepaymentRemainingMinor: bigint | null = null;
    if (row.prepayment) {
      const others = await this.prisma.client.prepaymentReturn.aggregate({
        where: {
          accountId,
          prepaymentId: row.prepaymentId,
          applicable: true,
          deletedAt: null,
          NOT: { id: row.id },
        },
        _sum: { sumMinor: true },
      });
      prepaymentRemainingMinor = row.prepayment.sumMinor - (others._sum.sumMinor ?? 0n);
    }
    return { ...row, prepaymentRemainingMinor };
  }

  /**
   * Check that the running total of applicable returns for a prepayment
   * (excluding `excludeId` if supplied — used on update/transition to
   * skip the current row) plus the new sum doesn't overflow the source.
   */
  private async assertWithinPrepaymentCap(
    tx: Prisma.TransactionClient,
    accountId: string,
    prepaymentId: string,
    addedSum: bigint,
    excludeId?: string,
  ): Promise<void> {
    const prepayment = await tx.prepayment.findFirst({
      where: { id: prepaymentId, accountId, deletedAt: null },
      select: { sumMinor: true, name: true },
    });
    if (!prepayment) throw new BadRequestException('Manba avans hujjati topilmadi');

    const existing = await tx.prepaymentReturn.aggregate({
      where: {
        accountId,
        prepaymentId,
        applicable: true,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      _sum: { sumMinor: true },
    });
    const alreadyReturned = existing._sum.sumMinor ?? 0n;
    if (alreadyReturned + addedSum > prepayment.sumMinor) {
      throw new BadRequestException(
        `Qaytarish summasi ortib ketdi: avans ${prepayment.name} bo'yicha jami ${prepayment.sumMinor.toString()} dan ${alreadyReturned.toString()} qaytarilgan, qolgan ${(prepayment.sumMinor - alreadyReturned).toString()}`,
      );
    }
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreatePrepaymentReturnSchema.parse(raw);
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'prepaymentreturn',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.prepaymentReturn.findMany({
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
    const name = String(n).padStart(5, '0');

    const moment = data.moment ? new Date(data.moment) : new Date();
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';
    const postedAt = applicable ? new Date() : null;
    const sumMinor = BigInt(data.sumMinor);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);
      // Pull source prepayment so we can default agent / organization
      // when the caller omits them, and to bail out early if source is
      // missing / soft-deleted / wrong tenant.
      const source = await tx.prepayment.findFirst({
        where: { id: data.prepaymentId, accountId, deletedAt: null },
        select: {
          agentId: true,
          organizationId: true,
          currency: true,
          contractId: true,
          projectId: true,
          organizationAccountId: true,
          agentAccountId: true,
        },
      });
      if (!source) throw new BadRequestException('Manba avans hujjati topilmadi');

      const agentId = data.agentId ?? source.agentId;
      const organizationId = data.organizationId ?? source.organizationId;
      // A refund is ALWAYS booked in the source advance's currency. Allowing a
      // different currency would let the over-return cap (which compares raw
      // minor units, currency-blind) be bypassed while `applyDelta` credits a
      // different counterparty-balance bucket → real over-refund in value.
      // Hence we ignore any client-supplied currency here. (audit 2026-06-03g)
      const currency = source.currency;
      // moysklad parity — Возврат предоплаты inherits Договор / Проект from
      // the source Предоплата unless explicitly overridden.
      const contractId = data.contractId ?? source.contractId;
      const projectId = data.projectId ?? source.projectId;
      const organizationAccountId = data.organizationAccountId ?? source.organizationAccountId;
      const agentAccountId = data.agentAccountId ?? source.agentAccountId;

      await assertOrgAccountMatchesOrg(
        this.prisma.client,
        accountId,
        organizationId,
        organizationAccountId,
      );

      if (applicable) {
        await this.assertWithinPrepaymentCap(tx, accountId, data.prepaymentId, sumMinor);
      }

      const row = await tx.prepaymentReturn.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          prepaymentId: data.prepaymentId,
          agentId,
          organizationId,
          contractId: contractId ?? null,
          projectId: projectId ?? null,
          organizationAccountId: organizationAccountId ?? null,
          agentAccountId: agentAccountId ?? null,
          retailShiftId: data.retailShiftId ?? null,
          retailStoreId: data.retailStoreId ?? null,
          name,
          sumMinor,
          vatSumMinor: BigInt(data.vatSumMinor),
          cashSumMinor: BigInt(data.cashSumMinor),
          noCashSumMinor: BigInt(data.noCashSumMinor),
          qrSumMinor: BigInt(data.qrSumMinor),
          vatEnabled: data.vatEnabled,
          vatIncluded: data.vatIncluded,
          taxSystem: data.taxSystem,
          currency,
          rateValue: BigInt(data.rateValue),
          description: data.description,
          externalCode: data.externalCode,
          moment,
          applicable,
          state,
          postedAt,
        },
      });
      if (applicable) {
        // Refund: +delta (customer's debt to us grows back / our debt shrinks)
        await this.balances.applyDelta(tx, accountId, agentId, currency, sumMinor);
      }
      return row;
    });
    // History parity (mirrors cash-in.service): every create writes an audit
    // row so the document's «Tarix» tab populates. Was silently empty — the
    // service wrote ZERO auditLog rows, so /audit-logs?entity=PrepaymentReturn
    // never returned anything.
    await this.logAudit(accountId, ownerId, 'create', created.id, null);
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdatePrepaymentReturnSchema.parse(raw);
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }
    const effectiveOrgId = data.organizationId ?? row.organizationId;
    const effectiveAccountId =
      data.organizationAccountId !== undefined
        ? data.organizationAccountId
        : row.organizationAccountId;
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      effectiveOrgId,
      effectiveAccountId,
    );
    try {
      await this.prisma.client.prepaymentReturn.update({
        where: { id, version: data.version },
        data: {
          ...(data.agentId ? { agentId: data.agentId } : {}),
          ...(data.organizationId ? { organizationId: data.organizationId } : {}),
          ...(data.contractId !== undefined ? { contractId: data.contractId ?? null } : {}),
          ...(data.projectId !== undefined ? { projectId: data.projectId ?? null } : {}),
          ...(data.organizationAccountId !== undefined
            ? { organizationAccountId: data.organizationAccountId ?? null }
            : {}),
          ...(data.agentAccountId !== undefined
            ? { agentAccountId: data.agentAccountId ?? null }
            : {}),
          ...(data.retailShiftId !== undefined ? { retailShiftId: data.retailShiftId } : {}),
          ...(data.retailStoreId !== undefined ? { retailStoreId: data.retailStoreId } : {}),
          ...(data.sumMinor ? { sumMinor: BigInt(data.sumMinor) } : {}),
          ...(data.vatSumMinor ? { vatSumMinor: BigInt(data.vatSumMinor) } : {}),
          ...(data.cashSumMinor ? { cashSumMinor: BigInt(data.cashSumMinor) } : {}),
          ...(data.noCashSumMinor ? { noCashSumMinor: BigInt(data.noCashSumMinor) } : {}),
          ...(data.qrSumMinor ? { qrSumMinor: BigInt(data.qrSumMinor) } : {}),
          ...(data.vatEnabled !== undefined ? { vatEnabled: data.vatEnabled } : {}),
          ...(data.vatIncluded !== undefined ? { vatIncluded: data.vatIncluded } : {}),
          ...(data.taxSystem !== undefined ? { taxSystem: data.taxSystem } : {}),
          // currency is intentionally NOT updatable — a refund stays in the source
          // advance's currency (set at create). See create() + schema. (2026-06-03g)
          ...(data.rateValue ? { rateValue: BigInt(data.rateValue) } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(data.moment ? { moment: new Date(data.moment) } : {}),
          version: { increment: 1 },
        },
      });
    } catch (e) {
      // Existence was confirmed by findById above; a P2025 here means the
      // version filter didn't match → a concurrent write bumped it → 409.
      mapVersionedUpdateError(e, 'PrepaymentReturn');
      throw e;
    }
    await this.logAudit(accountId, userId, 'update', id, null);
    return this.findById(accountId, id);
  }

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    await this.prisma.client.$transaction(async (tx) => {
      if (row.applicable) {
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -row.sumMinor);
      }
      await tx.prepaymentReturn.update({
        where: { id },
        data: { applicable: false, state: 'cancelled', deletedAt: new Date() },
      });
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: {
      ownerId?: string | null;
      projectId?: string | null;
      description?: string | null;
      groupId?: string | null;
      shared?: boolean;
    },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    if ('groupId' in patch) data.groupId = patch.groupId;
    if ('shared' in patch && patch.shared !== undefined) data.shared = patch.shared;
    const updated = await this.prisma.client.prepaymentReturn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.prepaymentReturn.update({
      where: { id, accountId },
      data: { printed },
    });
  }

  async transition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    const row = await this.findById(accountId, id);
    return this.prisma.client.$transaction(async (tx) => {
      if (target === 'post') {
        if (row.applicable) throw new BadRequestException('Already posted');
        await this.assertWithinPrepaymentCap(tx, accountId, row.prepaymentId, row.sumMinor, row.id);
        await tx.prepaymentReturn.update({
          where: { id },
          data: { applicable: true, state: 'posted', postedAt: new Date() },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, row.sumMinor);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PrepaymentReturn',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: row.state, after: 'posted' },
              amount: row.sumMinor.toString(),
            } as Prisma.InputJsonValue,
          },
        });
      } else if (target === 'unpost') {
        if (!row.applicable) throw new BadRequestException('Not posted');
        await tx.prepaymentReturn.update({
          where: { id },
          data: { applicable: false, state: 'draft', postedAt: null },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -row.sumMinor);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PrepaymentReturn',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: {
              from: { before: row.state, after: 'draft' },
            } as Prisma.InputJsonValue,
          },
        });
      } else if (target === 'cancel') {
        if (row.applicable) {
          await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -row.sumMinor);
        }
        await tx.prepaymentReturn.update({
          where: { id },
          data: { applicable: false, state: 'cancelled' },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PrepaymentReturn',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: row.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });
      }
      return this.findById(accountId, id);
    });
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * Mirrors cash-in.service — non-transactional sites (create/update/delete/
   * mass-edit) use the plain client; FSM transitions inline `tx.auditLog.create`
   * so the audit row commits atomically with the state change + balance delta.
   * The `entity` string MUST equal the web page's `auditEntity="PrepaymentReturn"`,
   * or the History tab stays empty.
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
        entity: 'PrepaymentReturn',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
