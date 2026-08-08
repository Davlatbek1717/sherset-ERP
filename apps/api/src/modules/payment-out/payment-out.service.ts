import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { InvoiceInService } from '../invoice-in/invoice-in.service.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { MONEY_TX_OPTS, transitionWithClaim } from '../shared/transition-with-claim.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromInvoiceInSchema,
  CreateFromPurchaseOrderAdvanceSchema,
  type CreatePaymentOutInput,
  CreatePaymentOutSchema,
  type PaymentOutFilterInput,
  PaymentOutFilterSchema,
  PaymentOutTransitionSchema,
  type PaymentOutTransitionTarget,
  type UpdatePaymentOutInput,
  UpdatePaymentOutSchema,
} from './payment-out.schema.js';

// re-export for type consumers
export type { CreatePaymentOutInput };

type OperationInput = {
  targetKind: 'invoicein' | 'purchaseorder';
  invoiceInId?: string | null;
  purchaseOrderId?: string | null;
  amountMinor: string;
};

@Injectable()
export class PaymentOutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    // forwardRef on both edges of the PaymentOut↔InvoiceIn↔PurchaseOrder
    // tri-cycle. Required since PurchaseOrder now also forward-imports
    // PaymentOutModule (for createPaymentOutFor in bulk action).
    @Inject(forwardRef(() => InvoiceInService))
    private readonly invoiceIn: InvoiceInService,
    @Inject(forwardRef(() => PurchaseOrderService))
    private readonly po: PurchaseOrderService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PaymentOutFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // payment row. (Before this sweep `sortBy` only allowed plain columns
    // [moment | name | sumMinor], so the nested case never existed — the bug
    // it prevents is sorting by counterparty/organization name producing a
    // Prisma validation error.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.paymentOut.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { operations: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.paymentOut.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror payment-in.service so the
   * PaymentOut filter panel reaches moysklad «Исходящие платежи» parity
   * (~13 backed fields) without two-place drift. Keeps the accountId tenant
   * guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: PaymentOutFilterInput,
  ): Prisma.PaymentOutWhereInput {
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
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
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
      ...(filter.purchaseOrderId
        ? { operations: { some: { purchaseOrderId: filter.purchaseOrderId } } }
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
    const payment = await this.prisma.client.paymentOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        owner: { select: { id: true, name: true, email: true } },
        operations: {
          include: {
            invoiceIn: {
              select: { id: true, name: true, state: true, sumMinor: true, payedSumMinor: true },
            },
            purchaseOrder: {
              select: { id: true, name: true, state: true, sumMinor: true, payedSumMinor: true },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException(`PaymentOut ${id} not found`);
    return payment;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );

    const sumMinor = BigInt(parsed.sumMinor);
    if (sumMinor <= 0n) {
      throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
    }
    if (parsed.operations.length > 0) {
      await this.ensureOperations(accountId, parsed.operations as OperationInput[], sumMinor);
    }

    const name = await this.nextPaymentName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'PaymentOut',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else creator + their
    // dept). Tenant-validate so a hand-crafted request can't point at another
    // account (mirrors cash-in.create / payment-in.create).
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
      const created = await this.prisma.client.paymentOut.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          paymentPurpose: parsed.paymentPurpose ?? null,
          // «Статья расходов» — now persisted (was never written before, which
          // left the list filter on this column dead). PaymentOut-only.
          expenseItem: parsed.expenseItem ?? null,
          // «Без закрывающих документов» — header checkbox.
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
              invoiceInId: op.targetKind === 'invoicein' ? (op.invoiceInId ?? null) : null,
              purchaseOrderId:
                op.targetKind === 'purchaseorder' ? (op.purchaseOrderId ?? null) : null,
              amountMinor: BigInt(op.amountMinor),
            })),
          },
        },
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'paymentout', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * Create a PaymentOut draft pre-allocated against a single InvoiceIn.
   * Defaults amount to the invoice's unpaid remainder.
   */
  async createFromInvoiceIn(accountId: string, userId: string, invoiceInId: string, raw: unknown) {
    const parsed = CreateFromInvoiceInSchema.parse(raw ?? {});
    const invoice = await this.prisma.client.invoiceIn.findFirst({
      where: { id: invoiceInId, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        sumMinor: true,
        payedSumMinor: true,
        state: true,
      },
    });
    if (!invoice) throw new NotFoundException('InvoiceIn topilmadi');

    const applicableStates = ['posted', 'partially_paid'];
    if (!applicableStates.includes(invoice.state)) {
      throw new BadRequestException(
        `To'lov qilib bo'lmaydi: faktura holati ${invoice.state}. Oldin provedeno qiling yoki fakturani to'liq to'lab bo'lgan.`,
      );
    }

    const remaining = invoice.sumMinor - invoice.payedSumMinor;
    const amount = parsed.sumMinor ? BigInt(parsed.sumMinor) : remaining;
    if (amount <= 0n) {
      throw new BadRequestException("Faktura allaqachon to'liq to'langan");
    }
    if (amount > remaining) {
      throw new BadRequestException(
        `To'lov summasi (${amount}) qoldiqdan (${remaining}) ortiq bo'la olmaydi`,
      );
    }

    return this.create(accountId, userId, {
      agentId: invoice.agentId,
      organizationId: invoice.organizationId,
      sumMinor: amount.toString(),
      paymentPurpose: parsed.paymentPurpose ?? `Schyot-faktura bo'yicha to'lov`,
      operations: [
        {
          targetKind: 'invoicein',
          invoiceInId,
          amountMinor: amount.toString(),
        },
      ],
    });
  }

  /**
   * Create a PaymentOut draft as an advance payment directly against a
   * PurchaseOrder (before a supplier invoice has been issued). Amount must
   * be explicit — no "remaining" default because PO may have no invoice yet.
   */
  async createFromPurchaseOrderAdvance(
    accountId: string,
    userId: string,
    purchaseOrderId: string,
    raw: unknown,
  ) {
    const parsed = CreateFromPurchaseOrderAdvanceSchema.parse(raw ?? {});
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        sumMinor: true,
        payedSumMinor: true,
        state: true,
      },
    });
    if (!order) throw new NotFoundException('PurchaseOrder topilmadi');

    const applicableStates = ['confirmed', 'partially_received', 'fully_received'];
    if (!applicableStates.includes(order.state)) {
      throw new BadRequestException(
        `Avans to'lovi qilib bo'lmaydi: PO holati ${order.state}. Oldin provedeno qiling.`,
      );
    }

    const amount = BigInt(parsed.sumMinor);
    if (amount <= 0n) {
      throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
    }
    const maxAdvance = order.sumMinor - order.payedSumMinor;
    if (amount > maxAdvance) {
      throw new BadRequestException(
        `Avans summasi (${amount}) PO qoldiqdan (${maxAdvance}) ortiq bo'la olmaydi`,
      );
    }

    return this.create(accountId, userId, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      sumMinor: amount.toString(),
      paymentPurpose: parsed.paymentPurpose ?? `PO bo'yicha avans to'lovi`,
      operations: [
        {
          targetKind: 'purchaseorder',
          purchaseOrderId,
          amountMinor: amount.toString(),
        },
      ],
    });
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno to'lovni o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.PaymentOutUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.paymentPurpose !== undefined) data.paymentPurpose = parsed.paymentPurpose;
    // «Статья расходов» — editable on a draft (mirrors paymentPurpose). Only
    // written when the key is present so an edit that omits it preserves the
    // existing value.
    if (parsed.expenseItem !== undefined) data.expenseItem = parsed.expenseItem;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
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
    if (parsed.organizationAccountId !== undefined) {
      data.organizationAccount = parsed.organizationAccountId
        ? { connect: { id: parsed.organizationAccountId } }
        : { disconnect: true };
    }
    if (parsed.agentAccountId !== undefined) {
      data.agentAccount = parsed.agentAccountId
        ? { connect: { id: parsed.agentAccountId } }
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
        'PaymentOut',
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
      // Read-only validation; the destructive deleteMany is deferred into the
      // versioned $transaction below so an optimistic-lock 409 rolls it back
      // (otherwise a stale-version save would leave the operations already
      // deleted = data corruption).
      await this.ensureOperations(accountId, parsed.operations as OperationInput[], sumForOps);
      data.operations = {
        create: parsed.operations.map((op) => ({
          accountId,
          targetKind: op.targetKind,
          invoiceInId: op.targetKind === 'invoicein' ? (op.invoiceInId ?? null) : null,
          purchaseOrderId: op.targetKind === 'purchaseorder' ? (op.purchaseOrderId ?? null) : null,
          amountMinor: BigInt(op.amountMinor),
        })),
      };
    }

    const effectiveOrgId = parsed.organizationId ?? existing.organizationId;
    const effectiveAccountId =
      parsed.organizationAccountId !== undefined
        ? parsed.organizationAccountId
        : existing.organizationAccountId;
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      effectiveOrgId,
      effectiveAccountId,
    );

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        // Clear old allocations INSIDE the tx so a version conflict (zero rows
        // updated → P2025) rolls back the delete. The nested data.operations
        // .create re-inserts the new allocations as part of the same update.
        if (parsed.operations !== undefined) {
          await tx.paymentOutOperation.deleteMany({
            where: { paymentOutId: id, accountId },
          });
        }
        return tx.paymentOut.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'paymentout', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'PaymentOut');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PaymentOutTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: PaymentOutTransitionTarget = r.data;

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
    this.webhookFire.fireForEvent(accountId, 'paymentout', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    const payment = await this.findById(accountId, id);
    if (payment.applicable || payment.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagi to'lovni o'chirish mumkin");
    }
    await this.prisma.client.paymentOut.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'paymentout', 'DELETE', id);
    return { ok: true };
  }

  /**
   * Duplicate the outgoing payment into a new draft. Header + invoice
   * operations copy; state resets to draft.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.findById(accountId, id);
    const name = await this.nextPaymentName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.paymentOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        // moysklad Скопировать preserves header refs (was lossy before).
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
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
          // Mirror create()'s targetKind-aware FK mapping. The previous
          // version copied only invoiceInId, so cloning a 'purchaseorder'
          // (advance) allocation produced a target-less row (targetKind=
          // 'purchaseorder' but purchaseOrderId=null) — the advance
          // allocation was silently lost. PaymentOutOperation is polymorphic
          // (invoice-in OR purchase-order), unlike PaymentIn's single-FK ops.
          create: source.operations.map((op) => ({
            accountId,
            targetKind: op.targetKind,
            invoiceInId: op.targetKind === 'invoicein' ? op.invoiceInId : null,
            purchaseOrderId: op.targetKind === 'purchaseorder' ? op.purchaseOrderId : null,
            amountMinor: op.amountMinor,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    this.webhookFire.fireForEvent(accountId, 'paymentout', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PaymentOutService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard (M-01/DUP-01): atomically claim draft→posted as the FIRST
      // op — the loser of a double-«Провести» sees count 0 → 409, never a
      // second balance delta.
      await transitionWithClaim(tx.paymentOut, {
        id,
        accountId,
        fromStates: ['draft'],
        toState: 'posted',
        message: "To'lov allaqachon o'tkazilgan yoki 'draft' holatida emas",
      });

      // We paid them → our debt shrinks toward zero → +delta.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
        { source: 'paymentOut', docType: 'paymentOut', docId: id },
      );

      // Apply each allocation to its target (InvoiceIn or direct PO advance).
      for (const op of existing.operations) {
        if (op.targetKind === 'invoicein' && op.invoiceInId) {
          // InvoiceIn.applyPayment cascades to PO.applyPayment internally
          // if the invoice has a linked PO.
          await this.invoiceIn.applyPayment(
            tx,
            accountId,
            userId,
            op.invoiceInId,
            op.amountMinor,
            'apply',
          );
        } else if (op.targetKind === 'purchaseorder' && op.purchaseOrderId) {
          // Advance payment directly on the PO (no InvoiceIn intermediate).
          await this.po.applyPayment(
            tx,
            accountId,
            userId,
            op.purchaseOrderId,
            op.amountMinor,
            'apply',
          );
        }
      }

      const updated = await tx.paymentOut.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentOut',
          entityId: id,
          action: 'transition:posted',
          fieldChanges: {
            from: { before: 'draft', after: 'posted' },
            operations: existing.operations.map((op) => ({
              targetKind: op.targetKind,
              invoiceInId: op.invoiceInId,
              purchaseOrderId: op.purchaseOrderId,
              amount: op.amountMinor.toString(),
            })),
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
    existing: Awaited<ReturnType<PaymentOutService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      await transitionWithClaim(tx.paymentOut, {
        id,
        accountId,
        fromStates: ['posted'],
        toState: 'draft',
        message: "To'lov 'posted' holatida emas (allaqachon o'zgartirilgan)",
      });

      // Undo: we owe them again → −delta.
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
        } else if (op.targetKind === 'purchaseorder' && op.purchaseOrderId) {
          await this.po.applyPayment(
            tx,
            accountId,
            userId,
            op.purchaseOrderId,
            op.amountMinor,
            'revert',
          );
        }
      }

      const updated = await tx.paymentOut.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentOut',
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
    existing: Awaited<ReturnType<PaymentOutService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // cancel claims the EXACT snapshotted state so a concurrent unpost that
      // already flipped posted→draft can't be double-reversed here.
      await transitionWithClaim(tx.paymentOut, {
        id,
        accountId,
        fromStates: [existing.state],
        toState: 'cancelled',
        message: "To'lov holati o'zgargan (allaqachon o'zgartirilgan)",
      });

      const wasApplicable = existing.applicable;
      if (wasApplicable) {
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
          } else if (op.targetKind === 'purchaseorder' && op.purchaseOrderId) {
            await this.po.applyPayment(
              tx,
              accountId,
              userId,
              op.purchaseOrderId,
              op.amountMinor,
              'revert',
            );
          }
        }
      }

      const updated = await tx.paymentOut.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentOut',
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

  private parseCreate(raw: unknown): CreatePaymentOutInput {
    const r = CreatePaymentOutSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePaymentOutInput {
    const r = UpdatePaymentOutSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
  ): Promise<void> {
    const [agent, org] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
  }

  private async ensureOperations(
    accountId: string,
    operations: OperationInput[],
    sumMinor: bigint,
  ): Promise<void> {
    let total = 0n;
    for (const op of operations) {
      const amount = BigInt(op.amountMinor);
      if (amount <= 0n)
        throw new BadRequestException("Operatsiya summasi 0 dan katta bo'lishi kerak");
      total += amount;

      if (op.targetKind === 'invoicein') {
        if (!op.invoiceInId)
          throw new BadRequestException('invoicein operatsiyasida invoiceInId kerak');
        const inv = await this.prisma.client.invoiceIn.findFirst({
          where: { id: op.invoiceInId, accountId, deletedAt: null },
          select: { id: true },
        });
        if (!inv) throw new BadRequestException(`InvoiceIn ${op.invoiceInId} topilmadi`);
      } else if (op.targetKind === 'purchaseorder') {
        if (!op.purchaseOrderId)
          throw new BadRequestException('purchaseorder operatsiyasida purchaseOrderId kerak');
        const order = await this.prisma.client.purchaseOrder.findFirst({
          where: { id: op.purchaseOrderId, accountId, deletedAt: null },
          select: { id: true },
        });
        if (!order) throw new BadRequestException(`PurchaseOrder ${op.purchaseOrderId} topilmadi`);
      }
    }
    if (total > sumMinor) {
      throw new BadRequestException(
        `Operatsiyalar jami (${total}) to'lov summasidan (${sumMinor}) ortiq`,
      );
    }
  }

  private async nextPaymentName(accountId: string): Promise<string> {
    // moysklad parity: plain zero-padded sequential number per type — NO
    // «ПР-YYYY-» prefix (moysklad shows «03204»). Mirrors customer-order; seeds
    // from the max existing plain-numeric name so we continue the real sequence
    // (legacy prefixed names are ignored).
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'paymentout',
      async () => {
        const rows = await this.prisma.client.paymentOut.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
        }
        return max;
      },
    );
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
    const updated = await this.prisma.client.paymentOut.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'paymentout', 'UPDATE', id, Object.keys(data));
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
        entity: 'PaymentOut',
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
        `Bu qiymat bilan to'lov allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
