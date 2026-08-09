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
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import { MoneyService } from '../money/money.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { MONEY_TX_OPTS, transitionWithClaim } from '../shared/transition-with-claim.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CashInFilterInput,
  CashInFilterSchema,
  CashInTransitionSchema,
  type CashInTransitionTarget,
  type CreateCashInInput,
  CreateCashInSchema,
  type UpdateCashInInput,
  UpdateCashInSchema,
} from './cash-in.schema.js';

/**
 * CashInService — inbound cash (ПКО). Mirror of PaymentInService, but:
 *   1. cashDeskId is required (not a bank account).
 *   2. post() calls MoneyService.applyDeltas with +sumMinor on the cashDesk
 *      AND InvoiceOutService.applyPayment for each allocation.
 *   3. unpost/cancel reverses both cascades.
 */
@Injectable()
export class CashInService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvoiceOutService) private readonly invoiceOut: InvoiceOutService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CashInFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // cash-in row. (Before this sweep `sortBy` only allowed plain columns,
    // so the nested case never existed — the bug it prevents is sorting by
    // counterparty/organization name producing a Prisma validation error.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.cashIn.findMany({
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
    const total = await this.prisma.client.cashIn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror payment-in.service so the
   * CashIn filter panel reaches moysklad «Приходные ордера» parity
   * (~13 backed fields) without two-place drift. Keeps the accountId tenant
   * guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(accountId: string, filter: CashInFilterInput): Prisma.CashInWhereInput {
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
      // «Группа контрагента» + «Владелец контрагента» both narrow the SAME
      // agent (Counterparty) relation, so they MUST share one `agent: {}`
      // clause — two separate `agent` keys in this spread would overwrite each
      // other (last-wins), silently dropping one predicate (mirror cash-out).
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
      ...(filter.invoiceOutId
        ? { operations: { some: { invoiceOutId: filter.invoiceOutId } } }
        : {}),
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
    const row = await this.prisma.client.cashIn.findFirst({
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
            invoiceOut: {
              select: { id: true, name: true, state: true, sumMinor: true, payedSumMinor: true },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`CashIn ${id} not found`);
    return row;
  }

  /**
   * moysklad «Создать → Приходный ордер» from a customer invoice — one draft
   * CashIn covering the invoice's remaining unpaid balance, LINKED via an
   * operation (targetKind=invoiceout) so posting it pays the invoice down.
   * Mirrors payment-in.createFromInvoiceOut; the account's first CashDesk is
   * the default till (same heuristic as invoice-in.createCashOutFor).
   */
  async createFromInvoiceOut(accountId: string, userId: string, invoiceOutId: string) {
    const invoice = await this.prisma.client.invoiceOut.findFirst({
      where: { id: invoiceOutId, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        sumMinor: true,
        payedSumMinor: true,
        state: true,
        name: true,
        // The receipt MUST be booked in the invoice's currency (+ its rate) so a
        // non-UZS invoice doesn't get a UZS-default ПКО that corrupts the
        // per-currency balance bucket / marks a foreign invoice paid by a domestic
        // receipt. Adversarial-review finding 2026-07-05.
        currency: true,
        rateValue: true,
      },
    });
    if (!invoice) throw new NotFoundException('InvoiceOut topilmadi');

    const applicableStates = ['posted', 'sent', 'partially_paid', 'overdue'];
    if (!applicableStates.includes(invoice.state)) {
      throw new BadRequestException(
        `To'lov qabul qilib bo'lmaydi: invoice holati ${invoice.state}. Oldin provedeno qiling.`,
      );
    }
    const remaining = invoice.sumMinor - invoice.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException("Invoice allaqachon to'liq to'langan");
    }

    // Pick a CashDesk in the INVOICE's currency (ensureRefs rejects a mismatch);
    // prefer an active till, deterministic by name. Graceful error if none.
    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId, currency: invoice.currency, archived: false },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    if (!cashDesk) {
      throw new BadRequestException(
        `${invoice.currency} valyutasidagi Kassa topilmadi — avval shu valyutada Kassa yarating`,
      );
    }

    return this.create(accountId, userId, {
      agentId: invoice.agentId,
      organizationId: invoice.organizationId,
      cashDeskId: cashDesk.id,
      currency: invoice.currency,
      rateValue: invoice.rateValue.toString(),
      sumMinor: remaining.toString(),
      paymentPurpose: `Оплата по счету ${invoice.name}`,
      operations: [
        {
          targetKind: 'invoiceout',
          invoiceOutId,
          amountMinor: remaining.toString(),
        },
      ],
    });
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
      'CashIn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else creator + their
    // dept). Tenant-validate so a hand-crafted request can't point at another
    // account (mirrors payment-in.create).
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
      const created = await this.prisma.client.cashIn.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          cashDeskId: parsed.cashDeskId,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          paymentPurpose: parsed.paymentPurpose ?? null,
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
              invoiceOutId: op.invoiceOutId,
              amountMinor: BigInt(op.amountMinor),
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'cashin', 'CREATE', created.id);
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

    const data: Prisma.CashInUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.paymentPurpose !== undefined) data.paymentPurpose = parsed.paymentPurpose;
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
        'CashIn',
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
      const sumForOps = parsed.sumMinor ? BigInt(parsed.sumMinor) : existing.sumMinor;
      // Read-only validation here; the destructive deleteMany is deferred into
      // the $transaction below so a version conflict (409) rolls back the
      // delete instead of leaving the operations destroyed (data corruption).
      await this.ensureOperations(accountId, parsed.operations, sumForOps);
      data.operations = {
        create: parsed.operations.map((op) => ({
          accountId,
          targetKind: op.targetKind,
          invoiceOutId: op.invoiceOutId,
          amountMinor: BigInt(op.amountMinor),
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the update touches zero rows → P2025
      // → the deleteMany rolls back, so the operations are NOT lost.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.operations !== undefined) {
          await tx.cashInOperation.deleteMany({ where: { cashInId: id, accountId } });
        }
        return tx.cashIn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'cashin', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'CashIn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = CashInTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: CashInTransitionTarget = r.data;

    // M-01/DUP-01 — see payment-in.transition: Serializable + retry, and
    // `findById` re-read inside the closure so a retry never re-posts a
    // document a rival transaction already posted.
    const result = await withSerializationRetry(async () => {
      const existing = await this.findById(accountId, id);
      return target === 'post'
        ? this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? this.unpost(accountId, userId, id, existing)
          : this.cancel(accountId, userId, id, existing);
    });
    this.webhookFire.fireForEvent(accountId, 'cashin', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard (Faza Q3, `M-01` leftover) — see payment-in.service.delete.
    // For the cash pair the orphan is doubly bad: post() moves the CashDesk
    // ledger too, so a posted-and-deleted doc leaves money in the till with no
    // document behind it.
    const res = await this.prisma.client.cashIn.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi hujjatni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'cashin', 'DELETE', id);
    return { ok: true };
  }

  /**
   * moysklad "Массовое редактирование" — patch ownerId / projectId /
   * description across selected rows. Metadata-only fields, editable even
   * when posted (they don't touch the financial amount). Mirrors
   * invoice-out.service.massEditApply. Tenant-guarded via findById.
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
    const updated = await this.prisma.client.cashIn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'cashin', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  /**
   * Duplicate the document into a new draft. Header copies (agent,
   * organization, cashDesk, currency, sumMinor, paymentPurpose,
   * description, attributes); operations (invoice allocations) copy too
   * so the user only needs to verify before posting. Same approach as
   * `customer-order.service.clone()` — moysklad's "Скопировать" action.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.findById(accountId, id);
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.cashIn.create({
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
            invoiceOutId: op.invoiceOutId,
            amountMinor: op.amountMinor,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    this.webhookFire.fireForEvent(accountId, 'cashin', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashInService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard (M-01/DUP-01): atomically claim draft→posted as the FIRST
      // op — the loser of a double-«Провести» sees count 0 → 409, never a
      // second CashDesk credit + balance delta.
      await transitionWithClaim(tx.cashIn, {
        id,
        accountId,
        fromStates: ['draft'],
        toState: 'posted',
        message: "Prixodniy order allaqachon o'tkazilgan yoki 'draft' holatida emas",
      });

      // Cash desk receives the money (+delta).
      await this.money.applyDeltas(tx, accountId, [
        {
          sourceKind: 'cash_desk',
          sourceId: existing.cashDeskId,
          deltaMinor: existing.sumMinor,
          currency: existing.currency,
          documentKind: 'cash_in',
          documentId: id,
          counterpartyId: existing.agentId,
          description: existing.paymentPurpose ?? undefined,
        },
      ]);

      // Counterparty balance: they paid us, so OUR receivable shrinks → -delta.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        -existing.sumMinor,
        {
          source: 'cashIn',
          docType: 'cashIn',
          docId: id,
          organizationId: existing.organizationId,
        },
      );

      // Apply each invoice allocation.
      for (const op of existing.operations) {
        if (op.targetKind === 'invoiceout' && op.invoiceOutId) {
          await this.invoiceOut.applyPayment(
            tx,
            accountId,
            userId,
            op.invoiceOutId,
            op.amountMinor,
            'apply',
          );
        }
      }

      const updated = await tx.cashIn.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashIn',
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
    }, MONEY_TX_OPTS);
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashInService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      await transitionWithClaim(tx.cashIn, {
        id,
        accountId,
        fromStates: ['posted'],
        toState: 'draft',
        message: "Prixodniy order 'posted' holatida emas (allaqachon o'zgartirilgan)",
      });

      // Reverse cash desk delta.
      await this.money.applyDeltas(tx, accountId, [
        {
          sourceKind: 'cash_desk',
          sourceId: existing.cashDeskId,
          deltaMinor: -existing.sumMinor,
          currency: existing.currency,
          documentKind: 'cash_in',
          documentId: id,
          counterpartyId: existing.agentId,
          description: `Unpost: ${existing.paymentPurpose ?? ''}`.trim(),
        },
      ]);

      // Reverse counterparty balance (they owe us again).
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
        { docType: 'cashIn', docId: id, organizationId: existing.organizationId },
      );

      // Reverse invoice allocations.
      for (const op of existing.operations) {
        if (op.targetKind === 'invoiceout' && op.invoiceOutId) {
          await this.invoiceOut.applyPayment(
            tx,
            accountId,
            userId,
            op.invoiceOutId,
            op.amountMinor,
            'revert',
          );
        }
      }

      const updated = await tx.cashIn.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashIn',
          entityId: id,
          action: 'transition:unposted',
          fieldChanges: { from: { before: 'posted', after: 'draft' } } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<CashInService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // cancel claims the EXACT snapshotted state so a concurrent unpost that
      // already flipped posted→draft can't be double-reversed here.
      await transitionWithClaim(tx.cashIn, {
        id,
        accountId,
        fromStates: [existing.state],
        toState: 'cancelled',
        message: "Prixodniy order holati o'zgargan (allaqachon o'zgartirilgan)",
      });

      if (existing.applicable) {
        await this.money.applyDeltas(tx, accountId, [
          {
            sourceKind: 'cash_desk',
            sourceId: existing.cashDeskId,
            deltaMinor: -existing.sumMinor,
            currency: existing.currency,
            documentKind: 'cash_in',
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
          existing.sumMinor,
          { docType: 'cashIn', docId: id, organizationId: existing.organizationId },
        );

        for (const op of existing.operations) {
          if (op.targetKind === 'invoiceout' && op.invoiceOutId) {
            await this.invoiceOut.applyPayment(
              tx,
              accountId,
              userId,
              op.invoiceOutId,
              op.amountMinor,
              'revert',
            );
          }
        }
      }

      const updated = await tx.cashIn.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CashIn',
          entityId: id,
          action: 'transition:cancelled',
          fieldChanges: {
            from: { before: existing.state, after: 'cancelled' },
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateCashInInput {
    const r = CreateCashInSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCashInInput {
    const r = UpdateCashInSchema.safeParse(raw);
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
    operations: Array<{ targetKind: string; invoiceOutId: string; amountMinor: string }>,
    sumMinor: bigint,
  ): Promise<void> {
    let total = 0n;
    for (const op of operations) {
      const amount = BigInt(op.amountMinor);
      if (amount <= 0n)
        throw new BadRequestException("Operatsiya summasi 0 dan katta bo'lishi kerak");
      total += amount;

      if (op.targetKind === 'invoiceout') {
        const inv = await this.prisma.client.invoiceOut.findFirst({
          where: { id: op.invoiceOutId, accountId, deletedAt: null },
          select: { id: true },
        });
        if (!inv) throw new BadRequestException(`InvoiceOut ${op.invoiceOutId} topilmadi`);
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
    // «ПКО-YYYY-» prefix. Mirrors customer-order; seeds from the max existing
    // plain-numeric name (legacy prefixed names ignored).
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'cashin', async () => {
      const rows = await this.prisma.client.cashIn.findMany({
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
        entity: 'CashIn',
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
