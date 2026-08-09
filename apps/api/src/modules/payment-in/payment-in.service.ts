import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { HR_EVENT, type PaymentInPostedEvent } from '../hr/hr-shared/hr-events.types.js';
import { InvoiceOutService } from '../invoice-out/invoice-out.service.js';
import type { MoneyDelta } from '../money/money.service.js';
import { MoneyService } from '../money/money.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { MONEY_TX_OPTS, transitionWithClaim } from '../shared/transition-with-claim.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromInvoiceOutSchema,
  type CreatePaymentInInput,
  CreatePaymentInSchema,
  type PaymentInFilterInput,
  PaymentInFilterSchema,
  PaymentInTransitionSchema,
  type PaymentInTransitionTarget,
  type UpdatePaymentInInput,
  UpdatePaymentInSchema,
} from './payment-in.schema.js';

// re-export for type consumers if any (noop but keeps import alive)
export type { CreatePaymentInInput };

@Injectable()
export class PaymentInService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvoiceOutService) private readonly invoiceOut: InvoiceOutService,
    @Inject(CustomerOrderService) private readonly customerOrder: CustomerOrderService,
    // Bank-side ledger (Faza 11, `M-06`) — mirrors CashIn/CashOut, which have
    // written the money ledger since day one. Positioned like theirs
    // (prisma, targets, money, balance, …) so the four money documents read
    // the same way.
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PaymentInFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // payment row. (Before this sweep `sortBy` only allowed plain columns,
    // so the nested case never existed — the bug it prevents is sorting by
    // counterparty/organization name producing a Prisma validation error.)
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.paymentIn.findMany({
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
    const total = await this.prisma.client.paymentIn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror invoice-out.service so the
   * PaymentIn filter panel reaches moysklad «Входящие платежи» parity
   * (~13 backed fields) without two-place drift. Keeps the accountId tenant
   * guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: PaymentInFilterInput,
  ): Prisma.PaymentInWhereInput {
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
              { incomingNumber: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the payment's 1-based
   * position in the default newest-first list + its neighbour ids, so the detail
   * toolbar shows the REAL total and the arrows walk the whole set even on a
   * direct-URL visit. Mirror of purchase-order.findPosition (no record-scope).
   */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.paymentIn.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`PaymentIn ${id} not found`);

    const filter = PaymentInFilterSchema.parse({});
    const where = this.buildListWhere(accountId, filter);

    // Tuple comparisons for the default (moment desc, id desc) order.
    const aboveCurrent: Prisma.PaymentInWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.PaymentInWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.paymentIn.count({ where }),
      this.prisma.client.paymentIn.count({ where: { AND: [where, aboveCurrent] } }),
      this.prisma.client.paymentIn.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      this.prisma.client.paymentIn.findFirst({
        where: { AND: [where, belowCurrent] },
        orderBy: [{ moment: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return {
      current: above + 1,
      total,
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
    };
  }

  async findById(accountId: string, id: string) {
    const payment = await this.prisma.client.paymentIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        salesChannel: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        owner: { select: { id: true, name: true, email: true } },
        operations: {
          // Rich «Оплаченные документы» grid needs each target's №/Статус/Дата/
          // Организация/Контрагент/К оплате(sum)/Не оплачено(sum−payed) for BOTH
          // invoice-out and customer-order targets.
          include: {
            invoiceOut: {
              select: {
                id: true,
                name: true,
                state: true,
                sumMinor: true,
                payedSumMinor: true,
                moment: true,
                organization: { select: { name: true } },
                agent: { select: { name: true } },
              },
            },
            customerOrder: {
              select: {
                id: true,
                name: true,
                state: true,
                sumMinor: true,
                payedSumMinor: true,
                moment: true,
                organization: { select: { name: true } },
                agent: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException(`PaymentIn ${id} not found`);
    return payment;
  }

  /**
   * `userId` — hujjatni yaratayotgan xodim. **`null`** = inson-aktor yo'q
   * (Faza 19, `INT-02`: Payme/Click webhook'i capture'dan PaymentIn yozadi).
   * Bunda egalik `ownerId` orqali oshkora beriladi, audit-yozuv esa aktorsiz
   * qoladi (`AuditLog.userId` nullable) — soxta «tizim xodimi» o'ylab
   * topilmaydi, chunki u kimningdir ismi ostida yolg'on iz qoldirardi.
   *
   * `tx` (Faza Q9, `INT-05`) — **ixtiyoriy tashqi tranzaksiya**. Berilsa
   * hujjatning HAMMA yozuvi (raqam-hisoblagich, `payment_ins` qatori,
   * operatsiyalar, audit) o'sha tranzaksiyada bajariladi, ya'ni chaqiruvchi
   * to'lovni **o'z yozuvi bilan atomik** qila oladi. Bank-import shu bilan
   * «to'lov yaratildi-yu, vypiska qatoriga bog'lanmadi» crash-oynasini
   * yopadi. Berilmasa xulq eski holicha (har yozuv o'z implicit
   * tranzaksiyasida) — mavjud chaqiruvchilar o'zgarmaydi.
   *
   * ⚠️ Tranzaksiya ICHIGA kirmaydigan ikki narsa (ataylab):
   *  - `webhookFire.fireForEvent` — fire-and-forget, o'z ulanishida yozadi;
   *    tashqi tx rollback bo'lsa mavjud bo'lmagan hujjat haqida webhook
   *    navbatga tushishi mumkin (best-effort quyi tizim, hujjatni bloklamaydi).
   *  - `assertMassEditRefsInTenant` / `attrs.validateAndNormalize` — faqat
   *    O'QIYDI (tenant-validatsiya), yozuv qilmaydi.
   */
  async create(
    accountId: string,
    userId: string | null,
    raw: unknown,
    tx?: Prisma.TransactionClient,
  ) {
    const db: Prisma.TransactionClient = tx ?? this.prisma.client;
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, db);
    await assertOrgAccountMatchesOrg(
      db,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId,
    );

    // Validate operations: each invoice must exist + belong to account; total ≤ sum
    const sumMinor = BigInt(parsed.sumMinor);
    if (sumMinor <= 0n) {
      throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
    }
    if (parsed.operations.length > 0) {
      await this.ensureOperations(accountId, parsed.operations, sumMinor, parsed.currency, db);
    }

    const name = await this.nextPaymentName(accountId, db);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'PaymentIn',
      parsed.attributes,
    );

    const creatorGroupId = userId ? await resolveCreatorGroupId(db, accountId, userId) : null;

    // «Владелец»/«Владелец-отдел»/«Общий доступ» from the owner popover (else fall
    // back to the creator + their dept). Tenant-validate the refs so a hand-crafted
    // request can't point ownerId/groupId at another account (mirrors invoice-in).
    if (parsed.ownerId) {
      await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
    }
    if (parsed.groupId) {
      const grp = await db.group.findFirst({
        where: { id: parsed.groupId, accountId },
        select: { id: true },
      });
      if (!grp) throw new BadRequestException("Bo'lim topilmadi");
    }

    try {
      const created = await db.paymentIn.create({
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
          incomingDate: parsed.incomingDate ? new Date(parsed.incomingDate) : null,
          incomingNumber: parsed.incomingNumber ?? null,
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
              invoiceOutId: op.invoiceOutId ?? null,
              customerOrderId: op.customerOrderId ?? null,
              amountMinor: BigInt(op.amountMinor),
            })),
          },
        },
      });

      await this.logAudit(accountId, userId, 'create', created.id, null, db);
      this.webhookFire.fireForEvent(accountId, 'paymentin', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async createFromInvoiceOut(
    accountId: string,
    userId: string,
    invoiceOutId: string,
    raw: unknown,
  ) {
    const parsed = CreateFromInvoiceOutSchema.parse(raw ?? {});
    const invoice = await this.prisma.client.invoiceOut.findFirst({
      where: { id: invoiceOutId, accountId, deletedAt: null },
      select: {
        id: true,
        agentId: true,
        organizationId: true,
        sumMinor: true,
        payedSumMinor: true,
        state: true,
        // Book the payment in the INVOICE's currency (+ its rate) so a non-UZS
        // invoice isn't paid by a UZS-default payment that lands in the wrong
        // per-currency balance bucket. Adversarial-review finding 2026-07-05.
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
    const amount = parsed.sumMinor ? BigInt(parsed.sumMinor) : remaining;
    if (amount <= 0n) {
      throw new BadRequestException("Invoice allaqachon to'liq to'langan");
    }
    if (amount > remaining) {
      throw new BadRequestException(
        `To'lov summasi (${amount}) qoldiqdan (${remaining}) ortiq bo'la olmaydi`,
      );
    }

    return this.create(accountId, userId, {
      agentId: invoice.agentId,
      organizationId: invoice.organizationId,
      currency: invoice.currency,
      rateValue: invoice.rateValue.toString(),
      sumMinor: amount.toString(),
      paymentPurpose: parsed.paymentPurpose ?? `To'lov schyot bo'yicha`,
      operations: [
        {
          targetKind: 'invoiceout',
          invoiceOutId,
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

    const data: Prisma.PaymentInUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.paymentPurpose !== undefined) data.paymentPurpose = parsed.paymentPurpose;
    if (parsed.incomingNumber !== undefined) data.incomingNumber = parsed.incomingNumber;
    if (parsed.incomingDate !== undefined) {
      data.incomingDate = parsed.incomingDate ? new Date(parsed.incomingDate) : null;
    }
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
    if (parsed.salesChannelId !== undefined) {
      data.salesChannel = parsed.salesChannelId
        ? { connect: { id: parsed.salesChannelId } }
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
        'PaymentIn',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.sumMinor !== undefined) {
      const newSum = BigInt(parsed.sumMinor);
      if (newSum <= 0n) throw new BadRequestException("sumMinor 0 dan katta bo'lishi kerak");
      data.sumMinor = newSum;
    }
    if (parsed.vatSumMinor !== undefined) data.vatSumMinor = BigInt(parsed.vatSumMinor);

    if (parsed.operations !== undefined) {
      const sumForOps = parsed.sumMinor ? BigInt(parsed.sumMinor) : existing.sumMinor;
      // Read-only validation here; the destructive deleteMany is deferred into
      // the $transaction below so a version conflict (409) rolls back the
      // delete instead of leaving the operations destroyed (data corruption).
      await this.ensureOperations(
        accountId,
        parsed.operations,
        sumForOps,
        parsed.currency ?? existing.currency,
      );
      data.operations = {
        create: parsed.operations.map((op) => ({
          accountId,
          targetKind: op.targetKind,
          invoiceOutId: op.invoiceOutId ?? null,
          customerOrderId: op.customerOrderId ?? null,
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
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the update touches zero rows → P2025
      // → the deleteMany rolls back, so the operations are NOT lost.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.operations !== undefined) {
          await tx.paymentInOperation.deleteMany({ where: { paymentInId: id, accountId } });
        }
        return tx.paymentIn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'paymentin', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'PaymentIn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PaymentInTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: PaymentInTransitionTarget = r.data;

    // M-01/DUP-01: money transitions now run Serializable, so a losing racer
    // aborts with 40001/P2034 instead of silently double-applying the balance
    // delta. `findById` is re-read INSIDE the retry closure (move/enter
    // precedent): retrying with a stale `existing` would re-post a document a
    // rival transaction already posted.
    const result = await withSerializationRetry(async () => {
      const existing = await this.findById(accountId, id);
      return target === 'post'
        ? this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? this.unpost(accountId, userId, id, existing)
          : this.cancel(accountId, userId, id, existing);
    });
    this.webhookFire.fireForEvent(accountId, 'paymentin', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard (Faza Q3, `M-01` leftover): the draft check + the soft-delete
    // are ONE atomic conditional write. Read-check-then-write let a concurrent
    // post() flip draft→posted inside the window, leaving the doc BOTH posted
    // (counterparty balance nudged) AND soft-deleted — an orphaned delta no
    // screen lists and no unpost can reverse. `deletedAt: null` additionally
    // makes a double-click delete idempotent (second call → 400, not a second
    // audit row). Same shape as the stock siblings (move/enter/supply/…).
    const res = await this.prisma.client.paymentIn.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi to'lovni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'paymentin', 'DELETE', id);
    return { ok: true };
  }

  /**
   * Duplicate the payment into a new draft. Header + invoice operations
   * copy; state resets to draft. Mirrors moysklad's "Скопировать".
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.findById(accountId, id);
    const name = await this.nextPaymentName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.paymentIn.create({
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
        salesChannelId: source.salesChannelId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        moment: new Date(),
        incomingDate: null,
        incomingNumber: null,
        paymentPurpose: source.paymentPurpose,
        description: source.description,
        currency: source.currency,
        rateValue: source.rateValue,
        sumMinor: source.sumMinor,
        vatSumMinor: source.vatSumMinor,
        attributes: (source.attributes ?? {}) as Prisma.InputJsonValue,
        state: 'draft',
        operations: {
          create: source.operations.map((op) => ({
            accountId,
            targetKind: op.targetKind,
            invoiceOutId: op.invoiceOutId,
            customerOrderId: op.customerOrderId,
            amountMinor: op.amountMinor,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    this.webhookFire.fireForEvent(accountId, 'paymentin', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  /**
   * The bank-account movement this payment causes (Faza 11, `M-06`).
   *
   * Returns `[]` when the document names no `organizationAccount` — the field
   * is optional (cash-only tenants, or a payment recorded before the account
   * was created), and inventing a source would be worse than recording none.
   * `applyDeltas([])` is a no-op, so every call site can pass this through
   * unconditionally.
   */
  private bankDeltas(
    existing: {
      organizationAccountId: string | null;
      currency: string;
      agentId: string;
      paymentPurpose: string | null;
    },
    id: string,
    deltaMinor: bigint,
    reason?: 'unpost' | 'cancel',
  ): MoneyDelta[] {
    if (!existing.organizationAccountId) return [];
    const purpose = existing.paymentPurpose ?? '';
    return [
      {
        sourceKind: 'organization_account',
        sourceId: existing.organizationAccountId,
        deltaMinor,
        currency: existing.currency,
        documentKind: 'payment_in',
        documentId: id,
        counterpartyId: existing.agentId,
        description: reason
          ? `${reason === 'unpost' ? 'Unpost' : 'Cancel'}: ${purpose}`.trim()
          : purpose || undefined,
        // See MoneyDelta.allowNegative — bank opening balances were never
        // captured, so the till overdraft rule cannot be applied here.
        allowNegative: true,
      },
    ];
  }

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PaymentInService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }

    const posted = await this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard (M-01/DUP-01): atomically claim draft→posted as the
      // FIRST op so a second concurrent «Провести» blocks on the row lock,
      // then loses with a clean 409 — never a second balance delta. Inside
      // the tx, so any later failure rolls the claim back too.
      await transitionWithClaim(tx.paymentIn, {
        id,
        accountId,
        fromStates: ['draft'],
        toState: 'posted',
        message: "To'lov allaqachon o'tkazilgan yoki 'draft' holatida emas",
      });

      // Bank account receives the money (+delta) — same shape as CashIn's
      // cash-desk credit, just the other money source.
      await this.money.applyDeltas(tx, accountId, this.bankDeltas(existing, id, existing.sumMinor));

      // Counterparty paid us → receivable shrinks.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        -existing.sumMinor,
        {
          source: 'paymentIn',
          docType: 'paymentIn',
          docId: id,
          organizationId: existing.organizationId,
        },
      );

      // Apply each allocation to its target (invoice-out OR customer-order).
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
        } else if (op.targetKind === 'customerorder' && op.customerOrderId) {
          await this.customerOrder.applyPayment(
            tx,
            accountId,
            userId,
            op.customerOrderId,
            op.amountMinor,
            'apply',
          );
        }
      }

      const updated = await tx.paymentIn.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentIn',
          entityId: id,
          action: 'transition:posted',
          fieldChanges: {
            from: { before: 'draft', after: 'posted' },
            operations: existing.operations.map((op) => ({
              invoiceOutId: op.invoiceOutId,
              amount: op.amountMinor.toString(),
            })),
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);

    // Post-commit: HR Telegram bridge listener picks this up and renders a
    // payment-confirmation message for the counterparty (if a template is
    // configured + the counterparty has a phone). See hr-notification.listener.
    const payload: PaymentInPostedEvent = {
      accountId,
      paymentInId: posted.id,
      counterpartyId: posted.agentId,
      sumMinor: posted.sumMinor,
      postedAt: posted.postedAt ?? new Date(),
    };
    this.events.emit(HR_EVENT.PAYMENT_IN_POSTED, payload);
    return posted;
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PaymentInService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      await transitionWithClaim(tx.paymentIn, {
        id,
        accountId,
        fromStates: ['posted'],
        toState: 'draft',
        message: "To'lov 'posted' holatida emas (allaqachon o'zgartirilgan)",
      });

      // Reverse the bank credit.
      await this.money.applyDeltas(
        tx,
        accountId,
        this.bankDeltas(existing, id, -existing.sumMinor, 'unpost'),
      );

      // Restore counterparty balance (they owe us again).
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
        { docType: 'paymentIn', docId: id, organizationId: existing.organizationId },
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
        } else if (op.targetKind === 'customerorder' && op.customerOrderId) {
          await this.customerOrder.applyPayment(
            tx,
            accountId,
            userId,
            op.customerOrderId,
            op.amountMinor,
            'revert',
          );
        }
      }

      const updated = await tx.paymentIn.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentIn',
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
    existing: Awaited<ReturnType<PaymentInService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // cancel claims the EXACT snapshotted state so a concurrent unpost that
      // already flipped posted→draft can't be double-reversed here.
      await transitionWithClaim(tx.paymentIn, {
        id,
        accountId,
        fromStates: [existing.state],
        toState: 'cancelled',
        message: "To'lov holati o'zgargan (allaqachon o'zgartirilgan)",
      });

      const wasApplicable = existing.applicable;
      if (wasApplicable) {
        await this.money.applyDeltas(
          tx,
          accountId,
          this.bankDeltas(existing, id, -existing.sumMinor, 'cancel'),
        );
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          existing.sumMinor,
          { docType: 'paymentIn', docId: id, organizationId: existing.organizationId },
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
          } else if (op.targetKind === 'customerorder' && op.customerOrderId) {
            await this.customerOrder.applyPayment(
              tx,
              accountId,
              userId,
              op.customerOrderId,
              op.amountMinor,
              'revert',
            );
          }
        }
      }

      const updated = await tx.paymentIn.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PaymentIn',
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

  private parseCreate(raw: unknown): CreatePaymentInInput {
    const r = CreatePaymentInSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePaymentInInput {
    const r = UpdatePaymentInSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<void> {
    const [agent, org] = await Promise.all([
      db.counterparty.findFirst({ where: { id: agentId, accountId } }),
      db.organization.findFirst({ where: { id: organizationId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
  }

  // M-04 (Faza 16): to'lov valyutasi nishon-hujjat valyutasi bilan mos
  // bo'lishi SHART — applyPayment payedSumMinor'ga summani yuzma-yuz
  // (konvertatsiyasiz) qo'shadi, valyuta farq qilsa USD-sent UZS-tiyinga
  // aralashib ~12 000× xato bo'lardi. moysklad ham bir-valyuta talab qiladi.
  private async ensureOperations(
    accountId: string,
    operations: Array<{
      targetKind: string;
      invoiceOutId?: string | null;
      customerOrderId?: string | null;
      amountMinor: string;
    }>,
    sumMinor: bigint,
    paymentCurrency: string,
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<void> {
    let total = 0n;
    for (const op of operations) {
      const amount = BigInt(op.amountMinor);
      if (amount <= 0n)
        throw new BadRequestException("Operatsiya summasi 0 dan katta bo'lishi kerak");
      total += amount;

      if (op.targetKind === 'invoiceout') {
        if (!op.invoiceOutId) throw new BadRequestException('invoiceOutId majburiy');
        const inv = await db.invoiceOut.findFirst({
          where: { id: op.invoiceOutId, accountId, deletedAt: null },
          select: { id: true, currency: true },
        });
        if (!inv) {
          throw new BadRequestException(`InvoiceOut ${op.invoiceOutId} topilmadi`);
        }
        this.assertOperationCurrency(
          paymentCurrency,
          inv.currency,
          `InvoiceOut ${op.invoiceOutId}`,
        );
      } else if (op.targetKind === 'customerorder') {
        if (!op.customerOrderId) throw new BadRequestException('customerOrderId majburiy');
        const co = await db.customerOrder.findFirst({
          where: { id: op.customerOrderId, accountId, deletedAt: null },
          select: { id: true, currency: true },
        });
        if (!co) {
          throw new BadRequestException(`CustomerOrder ${op.customerOrderId} topilmadi`);
        }
        this.assertOperationCurrency(
          paymentCurrency,
          co.currency,
          `CustomerOrder ${op.customerOrderId}`,
        );
      }
    }
    if (total > sumMinor) {
      throw new BadRequestException(
        `Operatsiyalar jami (${total}) to'lov summasidan (${sumMinor}) ortiq`,
      );
    }
  }

  private assertOperationCurrency(
    paymentCurrency: string,
    targetCurrency: string,
    targetLabel: string,
  ): void {
    if (paymentCurrency !== targetCurrency) {
      throw new BadRequestException(
        `Valyutalar mos emas: to'lov ${paymentCurrency}, ${targetLabel} esa ${targetCurrency}. ` +
          `To'lovni hujjat valyutasida kiriting`,
      );
    }
  }

  private async nextPaymentName(
    accountId: string,
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<string> {
    // moysklad parity: plain zero-padded sequential number per type — NO
    // «ПП-YYYY-» prefix (moysklad shows «10267»). Mirrors customer-order; seeds
    // from the max existing plain-numeric name (legacy prefixed names ignored).
    const n = await allocateDocumentNumber(db, accountId, 'paymentin', async () => {
      const rows = await db.paymentIn.findMany({
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
    const updated = await this.prisma.client.paymentIn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'paymentin', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  private async logAudit(
    accountId: string,
    userId: string | null,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'PaymentIn',
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
