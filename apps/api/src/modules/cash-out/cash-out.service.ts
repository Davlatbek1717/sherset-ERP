import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { MoneyService } from '../money/money.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CashOutFilterInput,
  CashOutFilterSchema,
  CashOutTransitionSchema,
  type CashOutTransitionTarget,
  type CreateCashOutInput,
  CreateCashOutSchema,
  type UpdateCashOutInput,
  UpdateCashOutSchema,
} from './cash-out.schema.js';

/**
 * CashOutService — outbound cash (РКО). Mirrors PaymentOut but targets a
 * CashDesk (not bank account). post() writes -sumMinor to cashDesk balance
 * and applies allocations to InvoiceIn.payedSum.
 */
@Injectable()
export class CashOutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvoiceInService) private readonly invoiceIn: InvoiceInService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CashOutFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // cash-out row. (Before this sweep `sortBy` only allowed plain columns,
    // so the nested case never existed — the bug it prevents is sorting by
    // counterparty/organization name producing a Prisma validation error.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.cashOut.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { operations: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.cashOut.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror cash-in.service so the
   * CashOut filter panel reaches moysklad «Расходные ордера» parity
   * (~14 backed fields) without two-place drift. Keeps the accountId tenant
   * guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(accountId: string, filter: CashOutFilterInput): Prisma.CashOutWhereInput {
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
      // «Группа контрагента» + «Владелец контрагента» both narrow the related
      // Counterparty, so they MUST share one `agent: {}` clause — two separate
      // `agent` keys in this object literal would silently overwrite each other
      // (object spread, last key wins), dropping one of the two predicates.
      ...(filter.agentGroupId || filter.agentOwnerId
        ? {
            agent: {
              ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
              ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
            },
          }
        : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.cashDeskId ? { cashDeskId: filter.cashDeskId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.salesChannelId ? { salesChannelId: filter.salesChannelId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.paymentPurpose
        ? { paymentPurpose: { contains: filter.paymentPurpose, mode: 'insensitive' } }
        : {}),
      ...(filter.expenseItem
        ? { expenseItem: { contains: filter.expenseItem, mode: 'insensitive' } }
        : {}),
      ...(filter.invoiceInId ? { operations: { some: { invoiceInId: filter.invoiceInId } } } : {}),
      ...momentRange,
      ...updatedRange,
      ...sumRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { paymentPurpose: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.cashOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        cashDesk: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        operations: {
          include: {
            invoiceIn: {
              select: { id: true, name: true, state: true, sumMinor: true, payedSumMinor: true },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`CashOut ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(
      accountId,
      parsed.agentId,
      parsed.organizationId,
      parsed.cashDeskId,
      parsed.currency,
    );

    const sumMinor = BigInt(parsed.sumMinor);
    if (sumMinor <= 0n) {
      throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
    }
    if (parsed.operations.length > 0) {
      await this.ensureOperations(accountId, parsed.operations, sumMinor);
    }

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'CashOut',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else creator + their
    // dept). Tenant-validate so a hand-crafted request can't point at another
    // account (mirrors cash-in.create).
    if (parsed.ownerId) {
      await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
    }
    if (parsed.groupId) {
      const grp = await this.prisma.client.group.findFirst({
        where: { id: parsed.groupId, accountId },
        select: { id: true },
      });
      if (!grp) throw new BadRequestException("Bo'lim topilmadi");
    }

    try {
      const created = await this.prisma.client.cashOut.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          cashDeskId: parsed.cashDeskId,
          salesChannelId: parsed.salesChannelId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          paymentPurpose: parsed.paymentPurpose ?? null,
          // «Статья расходов» — now persisted (was never written before, which
          // left the list filter on this column dead). Cash-out-only.
          expenseItem: parsed.expenseItem ?? null,
          // «Без закрывающих документов» — РКО header flag (default false).
          noClosingDocs: parsed.noClosingDocs ?? false,
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          sumMinor,
          vatSumMinor: BigInt(parsed.vatSumMinor ?? '0'),
          attributes: attributes as Prisma.InputJsonValue,
          state: 'draft',
          operations: {
            create: parsed.operations.map((op) => ({
              accountId,
              targetKind: op.targetKind,
              invoiceInId: op.invoiceInId,
              amountMinor: BigInt(op.amountMinor),
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'cashout', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno hujjatni o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.CashOutUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.paymentPurpose !== undefined) data.paymentPurpose = parsed.paymentPurpose;
    // «Статья расходов» — editable on a draft (mirrors paymentPurpose). Only
    // written when the key is present so an edit that omits it preserves the
    // existing value.
    if (parsed.expenseItem !== undefined) data.expenseItem = parsed.expenseItem;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.cashDeskId) data.cashDesk = { connect: { id: parsed.cashDeskId } };
    if (parsed.contractId !== undefined) {
      data.contract = parsed.contractId
        ? { connect: { id: parsed.contractId } }
        : { disconnect: true };
    }
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    // §60 silent-drop: create() persists currency/rateValue and clone()
    // preserves them, but update() dropped them on draft edits. This is
    // the §40 pattern (which only covered sales/purchase docs — money
    // docs were left for this sweep). Draft-only via the applicable guard.
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'CashOut',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.sumMinor !== undefined) {
      const newSum = BigInt(parsed.sumMinor);
      if (newSum <= 0n) throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
      data.sumMinor = newSum;
    }

    if (parsed.operations !== undefined) {
      // Read-only validation + build the nested-create payload here, but DO NOT
      // delete the old operations yet — the standalone deleteMany must move
      // INSIDE the versioned $transaction below. Otherwise an optimistic-lock
      // 409 (or a concurrent race) would leave the operations already deleted
      // = data corruption / orphaned rows.
      const sumForOps = parsed.sumMinor ? BigInt(parsed.sumMinor) : existing.sumMinor;
      await this.ensureOperations(accountId, parsed.operations, sumForOps);
      data.operations = {
        create: parsed.operations.map((op) => ({
          accountId,
          targetKind: op.targetKind,
          invoiceInId: op.invoiceInId,
          amountMinor: BigInt(op.amountMinor),
        })),
      };
    }

    try {
      // Optimistic lock: deleteMany + versioned update run atomically. If the
      // row's version no longer matches (concurrent write), the update touches
      // zero rows → Prisma P2025 → the whole tx (including the deleteMany)
      // rolls back, so the operations are NOT lost on conflict.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.operations !== undefined) {
          await tx.cashOutOperation.deleteMany({
            where: { cashOutId: id, accountId },
          });
        }
        return tx.cashOut.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'cashout', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'CashOut');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = CashOutTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: CashOutTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'cashout', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.applicable || row.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagi hujjatni o'chirish mumkin");
    }
    await this.prisma.client.cashOut.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'cashout', 'DELETE', id);
    return { ok: true };
  }

  /**
   * Duplicate the document into a new draft. Mirrors moysklad's
   * "Скопировать". See cash-in.service.ts for the rationale; we keep
   * operations attached so the user only verifies before posting.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.findById(accountId, id);
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.cashOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        cashDeskId: source.cashDeskId,
        // moysklad Скопировать preserves header refs (was lossy before).
        contractId: source.contractId,
        projectId: source.projectId,
        externalCode: source.externalCode,
        moment: new Date(),
        paymentPurpose: source.paymentPurpose,
        // moysklad Скопировать preserves the expense item too.
        expenseItem: source.expenseItem,
        description: source.description,
        currency: source.currency,
        rateValue: source.rateValue,
        sumMinor: source.sumMinor,
        attributes: (source.attributes ?? {}) as Prisma.InputJsonValue,
        state: 'draft',
        operations: {
          create: source.operations.map((op) => ({
            accountId,
            targetKind: op.targetKind,
            invoiceInId: op.invoiceInId,
            amountMinor: op.amountMinor,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    this.webhookFire.fireForEvent(accountId, 'cashout', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashOutService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Cash desk gives out the money (-delta). MoneyService enforces no overdraft.
      await this.money.applyDeltas(tx, accountId, [
        {
          sourceKind: 'cash_desk',
          sourceId: existing.cashDeskId,
          deltaMinor: -existing.sumMinor,
          currency: existing.currency,
          documentKind: 'cash_out',
          documentId: id,
          counterpartyId: existing.agentId,
          description: existing.paymentPurpose ?? undefined,
        },
      ]);

      // We paid them, so our debt shrinks toward zero → +delta.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
      );

      for (const op of existing.operations) {
        if (op.targetKind === 'invoicein' && op.invoiceInId) {
          await this.invoiceIn.applyPayment(
            tx,
            accountId,
            userId,
            op.invoiceInId,
            op.amountMinor,
            'apply',
          );
        }
      }

      const updated = await tx.cashOut.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashOut',
          entityId: id,
          action: 'transition:posted',
          fieldChanges: {
            from: { before: 'draft', after: 'posted' },
            cashDeskId: existing.cashDeskId,
            amount: existing.sumMinor.toString(),
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashOutService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      await this.money.applyDeltas(tx, accountId, [
        {
          sourceKind: 'cash_desk',
          sourceId: existing.cashDeskId,
          deltaMinor: existing.sumMinor,
          currency: existing.currency,
          documentKind: 'cash_out',
          documentId: id,
          counterpartyId: existing.agentId,
          description: `Unpost: ${existing.paymentPurpose ?? ''}`.trim(),
        },
      ]);

      // Undo balance shrinkage (we owe them again).
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        -existing.sumMinor,
      );

      for (const op of existing.operations) {
        if (op.targetKind === 'invoicein' && op.invoiceInId) {
          await this.invoiceIn.applyPayment(
            tx,
            accountId,
            userId,
            op.invoiceInId,
            op.amountMinor,
            'revert',
          );
        }
      }

      const updated = await tx.cashOut.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashOut',
          entityId: id,
          action: 'transition:unposted',
          fieldChanges: { from: { before: 'posted', after: 'draft' } } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashOutService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(async (tx) => {
      if (existing.applicable) {
        await this.money.applyDeltas(tx, accountId, [
          {
            sourceKind: 'cash_desk',
            sourceId: existing.cashDeskId,
            deltaMinor: existing.sumMinor,
            currency: existing.currency,
            documentKind: 'cash_out',
            documentId: id,
            counterpartyId: existing.agentId,
            description: `Cancel: ${existing.paymentPurpose ?? ''}`.trim(),
          },
        ]);
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          -existing.sumMinor,
        );

        for (const op of existing.operations) {
          if (op.targetKind === 'invoicein' && op.invoiceInId) {
            await this.invoiceIn.applyPayment(
              tx,
              accountId,
              userId,
              op.invoiceInId,
              op.amountMinor,
              'revert',
            );
          }
        }
      }

      const updated = await tx.cashOut.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashOut',
          entityId: id,
          action: 'transition:cancelled',
          fieldChanges: {
            from: { before: existing.state, after: 'cancelled' },
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateCashOutInput {
    const r = CreateCashOutSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCashOutInput {
    const r = UpdateCashOutSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
    cashDeskId: string,
    currency: string,
  ): Promise<void> {
    const [agent, org, cashDesk] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.cashDesk.findFirst({ where: { id: cashDeskId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!cashDesk) throw new BadRequestException('Kassa topilmadi');
    if (cashDesk.currency !== currency) {
      throw new BadRequestException(
        `Kassa valyutasi (${cashDesk.currency}) hujjat valyutasidan (${currency}) farq qiladi`,
      );
    }
  }

  private async ensureOperations(
    accountId: string,
    operations: Array<{ targetKind: string; invoiceInId: string; amountMinor: string }>,
    sumMinor: bigint,
  ): Promise<void> {
    let total = 0n;
    for (const op of operations) {
      const amount = BigInt(op.amountMinor);
      if (amount <= 0n)
        throw new BadRequestException("Operatsiya summasi 0 dan katta bo'lishi kerak");
      total += amount;

      if (op.targetKind === 'invoicein') {
        const inv = await this.prisma.client.invoiceIn.findFirst({
          where: { id: op.invoiceInId, accountId, deletedAt: null },
          select: { id: true },
        });
        if (!inv) throw new BadRequestException(`InvoiceIn ${op.invoiceInId} topilmadi`);
      }
    }
    if (total > sumMinor) {
      throw new BadRequestException(
        `Operatsiyalar jami (${total}) hujjat summasidan (${sumMinor}) ortiq`,
      );
    }
  }

  private async nextName(accountId: string): Promise<string> {
    // moysklad parity: plain zero-padded sequential number per type — NO
    // «РКО-YYYY-» prefix. Mirrors customer-order; seeds from the max existing
    // plain-numeric name (legacy prefixed names ignored).
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'cashout', async () => {
      const rows = await this.prisma.client.cashOut.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
      }
      return max;
    });
    return String(n).padStart(5, '0');
  }

  /**
   * moysklad "Массовое редактирование" — patch ownerId / projectId /
   * description across selected rows. Metadata-only fields, editable even
   * when posted. Mirrors invoice-out.service.massEditApply. Tenant-guarded.
   */
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
      expenseItem?: string | null;
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
    if ('expenseItem' in patch) data.expenseItem = patch.expenseItem;
    const updated = await this.prisma.client.cashOut.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'cashout', 'UPDATE', id, Object.keys(data));
    return updated;
  }

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
        entity: 'CashOut',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu qiymat bilan hujjat allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
