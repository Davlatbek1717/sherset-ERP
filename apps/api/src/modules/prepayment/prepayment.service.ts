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
  CreatePrepaymentSchema,
  type PrepaymentFilterInput,
  PrepaymentFilterSchema,
  UpdatePrepaymentSchema,
} from './prepayment.schema.js';

/**
 * Prepayment service — customer advance received before goods change hands.
 *
 * Balance direction (mirrors PaymentIn / CashIn):
 *   post → −sumMinor on CounterpartyBalance (customer's debt to us shrinks)
 *   unpost / cancel from posted → +sumMinor (reverse)
 *
 * The retail-specific split (cash/noCash/QR) is captured but does not
 * affect the balance — only the total `sumMinor` is what hits the
 * counterparty balance. The split exists for cashier reporting + soliq
 * fiscal printer integration that the retail shift later consumes.
 */
@Injectable()
export class PrepaymentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyBalanceService)
    private readonly balances: CounterpartyBalanceService,
  ) {}

  async list(accountId: string, raw: unknown) {
    const filter = PrepaymentFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // prepayment row. (Before this sweep `sortBy` only allowed plain columns,
    // so sorting by counterparty/organization name was impossible — the list
    // header offered no such sort. Mirrors payment-in.service.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.prepayment.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true } },
        customerOrder: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.prepayment.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror payment-in.service
   * so the Prepayment filter panel reaches moysklad «Предоплаты» (retail
   * variant) parity without two-place drift. Keeps the accountId tenant guard
   * + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: PrepaymentFilterInput,
  ): Prisma.PrepaymentWhereInput {
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
    const sumRange =
      filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {};

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.customerOrderId ? { customerOrderId: filter.customerOrderId } : {}),
      ...(filter.retailShiftId ? { retailShiftId: filter.retailShiftId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...momentRange,
      ...updatedRange,
      ...sumRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.prepayment.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        customerOrder: { select: { id: true, name: true, sumMinor: true, payedSumMinor: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`Prepayment ${id} not found`);
    return row;
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreatePrepaymentSchema.parse(raw);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      data.organizationId,
      data.organizationAccountId ?? null,
    );
    // Auto-numbering: PR-YYYY-NNNNN. Сlerk-recognisable prefix, mirrors the
    // KV / ПКО / РКО schemes used by sister money docs.
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'prepayment',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.prepayment.findMany({
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

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.prepayment.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          agentId: data.agentId,
          organizationId: data.organizationId,
          contractId: data.contractId ?? null,
          projectId: data.projectId ?? null,
          organizationAccountId: data.organizationAccountId ?? null,
          agentAccountId: data.agentAccountId ?? null,
          customerOrderId: data.customerOrderId ?? null,
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
          currency: data.currency,
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
        // PaymentIn convention: money in from agent → -delta
        await this.balances.applyDelta(tx, accountId, data.agentId, data.currency, -sumMinor);
      }
      return row;
    });
    // History parity (mirrors cash-in.service): every create writes an audit
    // row so the document's «Tarix» tab populates. Was silently empty — the
    // service wrote ZERO auditLog rows, so /audit-logs?entity=Prepayment never
    // returned anything.
    await this.logAudit(accountId, ownerId, 'create', created.id, null);
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdatePrepaymentSchema.parse(raw);
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }
    const effectiveOrgId = data.organizationId ?? row.organizationId;
    const effectiveAccountId =
      data.organizationAccountId !== undefined
        ? (data.organizationAccountId ?? null)
        : row.organizationAccountId;
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      effectiveOrgId,
      effectiveAccountId,
    );
    // Optimistic-lock: the update is gated on the version the form loaded
    // (WHERE id+version SET …, version+1). A concurrent write since the form
    // opened bumped the version → 0 rows match → Prisma P2025 → 409, instead of
    // silently clobbering the other user's change (lost-update guard).
    try {
      await this.prisma.client.prepayment.update({
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
          ...(data.customerOrderId !== undefined ? { customerOrderId: data.customerOrderId } : {}),
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
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.rateValue ? { rateValue: BigInt(data.rateValue) } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(data.moment ? { moment: new Date(data.moment) } : {}),
          version: { increment: 1 },
        },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Prepayment');
      throw e;
    }
    await this.logAudit(accountId, userId, 'update', id, null);
    return this.findById(accountId, id);
  }

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    await this.prisma.client.$transaction(async (tx) => {
      if (row.applicable) {
        // Reverse the -sumMinor delta we applied on post
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, row.sumMinor);
      }
      await tx.prepayment.update({
        where: { id },
        data: { applicable: false, state: 'cancelled', deletedAt: new Date() },
      });
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  /** mass-edit single-row apply — direct Prisma write, controller has
   *  pre-validated the patch against the field whitelist. */
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
    const updated = await this.prisma.client.prepayment.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  /** Toggle the `printed` flag — paired with the bulk-print endpoint
   *  (mirrors moysklad's "Уже напечатано" workflow). */
  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.prepayment.update({ where: { id, accountId }, data: { printed } });
  }

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    return this.create(accountId, ownerId, {
      agentId: src.agentId,
      organizationId: src.organizationId,
      contractId: src.contractId ?? undefined,
      projectId: src.projectId ?? undefined,
      organizationAccountId: src.organizationAccountId ?? undefined,
      agentAccountId: src.agentAccountId ?? undefined,
      customerOrderId: src.customerOrderId,
      retailShiftId: src.retailShiftId,
      retailStoreId: src.retailStoreId,
      sumMinor: src.sumMinor.toString(),
      vatSumMinor: src.vatSumMinor.toString(),
      cashSumMinor: src.cashSumMinor.toString(),
      noCashSumMinor: src.noCashSumMinor.toString(),
      qrSumMinor: src.qrSumMinor.toString(),
      vatEnabled: src.vatEnabled,
      vatIncluded: src.vatIncluded,
      taxSystem: src.taxSystem ?? undefined,
      currency: src.currency,
      rateValue: src.rateValue.toString(),
      description: src.description ?? undefined,
      externalCode: src.externalCode ?? undefined,
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
    await this.prisma.client.$transaction(async (tx) => {
      if (target === 'post') {
        if (row.applicable) throw new BadRequestException('Already posted');
        await tx.prepayment.update({
          where: { id },
          data: { applicable: true, state: 'posted', postedAt: new Date() },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, -row.sumMinor);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Prepayment',
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
        await tx.prepayment.update({
          where: { id },
          data: { applicable: false, state: 'draft', postedAt: null },
        });
        await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, row.sumMinor);
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Prepayment',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: {
              from: { before: row.state, after: 'draft' },
            } as Prisma.InputJsonValue,
          },
        });
      } else if (target === 'cancel') {
        if (row.applicable) {
          await this.balances.applyDelta(tx, accountId, row.agentId, row.currency, row.sumMinor);
        }
        await tx.prepayment.update({
          where: { id },
          data: { applicable: false, state: 'cancelled' },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Prepayment',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: row.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
    return this.findById(accountId, id);
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * Mirrors cash-in.service — non-transactional sites (create/update/delete/
   * mass-edit) use the plain client; FSM transitions inline `tx.auditLog.create`
   * so the audit row commits atomically with the state change + balance delta.
   * The `entity` string MUST equal the web page's `auditEntity="Prepayment"`,
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
        entity: 'Prepayment',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
