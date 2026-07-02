import type { Prisma } from '@moysklad/db';
import { computePositionTotal, scaleMinorByQty } from '@moysklad/money';
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
import { computePerUnitCost } from '../demand/fifo-consumer.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromSupplySchema,
  type CreatePurchaseReturnInput,
  CreatePurchaseReturnSchema,
  type PurchaseReturnFilterInput,
  PurchaseReturnFilterSchema,
  PurchaseReturnTransitionSchema,
  type PurchaseReturnTransitionTarget,
  type UpdatePurchaseReturnInput,
  UpdatePurchaseReturnSchema,
} from './purchase-return.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

/**
 * PurchaseReturnService — outbound stock side (goods back to supplier).
 *
 * post() contract:
 *   1. Negative StockDeltas (goods leave inventory)
 *   2. StockService.applyDeltas inside Serializable tx (sufficiency check not
 *      strictly required since we originally received these goods, but guard
 *      against double-returns via original Supply position ref)
 *   3. If original Supply was linked to a PO → cascade
 *      PurchaseOrderService.applyReceipt(tx, ..., direction='revert')
 *   4. Audit event 'purchasereturn.posted'.
 */
@Injectable()
export class PurchaseReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(PurchaseOrderService) private readonly po: PurchaseOrderService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PurchaseReturnFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for agent/organization.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.purchaseReturn.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        supply: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.purchaseReturn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror invoice-in.service so
   * the PurchaseReturn filter panel reaches moysklad «Возвраты поставщикам»
   * parity (~15 backed fields) without two-place drift. Keeps the accountId
   * tenant guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: PurchaseReturnFilterInput,
  ): Prisma.PurchaseReturnWhereInput {
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
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.supplyId ? { supplyId: filter.supplyId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...momentRange,
      ...updatedRange,
      ...sumRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { reason: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const pr = await this.prisma.client.purchaseReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        owner: { select: { id: true, name: true, email: true } },
        supply: { select: { id: true, name: true, state: true, purchaseOrderId: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pr) throw new NotFoundException(`PurchaseReturn ${id} not found`);
    return pr;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.supplyId) await this.ensureSupply(accountId, parsed.supplyId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'PurchaseReturn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.purchaseReturn.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          supplyId: parsed.supplyId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          reason: parsed.reason,
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          vatEnabled: parsed.vatEnabled,
          vatIncluded: parsed.vatIncluded,
          attributes: attributes as Prisma.InputJsonValue,
          state: 'draft',
          positions: {
            create: parsed.positions.map((p, idx) => ({
              accountId,
              position: idx + 1,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              productId: p.assortmentKind === 'product' ? p.assortmentId : null,
              supplyPositionId: p.supplyPositionId ?? null,
              quantity: p.quantity,
              priceMinor: BigInt(p.priceMinor),
              discount: p.discount ?? '0',
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.purchaseReturn.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'CREATE', created.id);
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async createFromSupply(accountId: string, userId: string, supplyId: string, raw: unknown) {
    const parsed = CreateFromSupplySchema.parse(raw ?? {});
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      include: { positions: true },
    });
    if (!supply) throw new BadRequestException('Supply topilmadi');
    if (supply.state !== 'posted') {
      throw new BadRequestException(
        `Supply '${supply.state}' holatida — faqat 'posted'dan qaytarish mumkin`,
      );
    }

    const storeId = parsed.storeId ?? supply.storeId;

    const positions = supply.positions
      .map((sp) => {
        const want = parsed.quantities?.[sp.id] ?? String(sp.quantity);
        const wantNum = Number(want);
        if (wantNum <= 0) return null;
        if (wantNum > Number(String(sp.quantity))) {
          throw new BadRequestException(
            `Position ${sp.id}: original qty ${String(sp.quantity)} dan ortiq qaytarish mumkin emas`,
          );
        }
        return {
          assortmentKind: sp.assortmentKind as 'product',
          assortmentId: sp.assortmentId,
          supplyPositionId: sp.id,
          quantity: want,
          priceMinor: sp.priceMinor.toString(),
          discount: sp.discount.toString(),
          vat: sp.vat ?? null,
          vatEnabled: sp.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Qaytariladigan pozitsiyalar yo'q");
    }

    return this.create(accountId, userId, {
      agentId: supply.agentId,
      organizationId: supply.organizationId,
      storeId,
      supplyId: supply.id,
      reason: parsed.reason ?? null,
      vatEnabled: supply.vatEnabled,
      vatIncluded: supply.vatIncluded,
      currency: supply.currency,
      rateValue: supply.rateValue.toString(),
      positions,
    });
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno qaytarishni o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
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

    const data: Prisma.PurchaseReturnUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.reason !== undefined) data.reason = parsed.reason;
    // moysklad allows changing currency/rate on a draft — schema accepts
    // them (.partial of Create); else silently dropped (§39 sibling).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'PurchaseReturn',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.supplyId !== undefined) {
      data.supply = parsed.supplyId ? { connect: { id: parsed.supplyId } } : { disconnect: true };
    }
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

    if (parsed.positions !== undefined) {
      // Read-only build here; the destructive deleteMany is deferred into the
      // $transaction below so a version conflict (409) rolls back the delete
      // instead of leaving the positions destroyed (data corruption).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          supplyPositionId: p.supplyPositionId ?? null,
          quantity: p.quantity,
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), update#1 touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. update#1
      // carries the version filter + increment; update#2 (totals) is keyed on
      // {id, accountId} only — update#1 already bumped the row to N+1, so a
      // version filter there would always miss and false-409.
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.purchaseReturnPosition.deleteMany({
            where: { purchaseReturnId: id, accountId },
          });
        }
        const updated = await tx.purchaseReturn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.purchaseReturn.update({
          where: { id, accountId },
          data: totals,
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id);
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'PurchaseReturn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PurchaseReturnTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: PurchaseReturnTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: state check + soft-delete are ONE atomic conditional write,
    // so a concurrent post() flipping draft→posted can't slip a delete through.
    const res = await this.prisma.client.purchaseReturn.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi qaytarishni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'DELETE', id);
    return { ok: true };
  }

  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; projectId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.purchaseReturn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.purchaseReturn.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.purchaseReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Qaytarish topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.purchaseReturn.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        supplyId: source.supplyId,
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        reason: source.reason,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» keeps the document currency + rate (a
        // cloned USD/EUR doc must not silently reset to UZS) — §8.3.
        currency: source.currency,
        rateValue: source.rateValue,
        vatEnabled: source.vatEnabled,
        vatIncluded: source.vatIncluded,
        state: 'draft',
        applicable: false,
        sumMinor: source.sumMinor,
        vatSumMinor: source.vatSumMinor,
        positions: {
          create: source.positions.map((p) => ({
            accountId,
            position: p.position,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            productId: p.productId,
            quantity: p.quantity,
            priceMinor: p.priceMinor,
            discount: p.discount,
            vat: p.vat,
            vatEnabled: p.vatEnabled,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted allowed (current: ${existing.state})`);
    }

    const store = await this.prisma.client.store.findFirst({
      where: { id: existing.storeId, accountId },
      select: { id: true, allowNegativeStock: true },
    });
    if (!store) throw new NotFoundException('Ombor topilmadi');

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 →
        // clean 409 — never a second stock deduction.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Qaytarish allaqachon o'tkazilgan yoki 'draft' holatida emas",
          );
        }

        // Lock + sufficiency check (same pattern as Demand post)
        const assortments = existing.positions.map((p) => ({
          kind: p.assortmentKind,
          id: p.assortmentId,
        }));
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          existing.storeId,
          assortments,
        );
        this.stock.assertAvailable(
          store.allowNegativeStock,
          existing.positions.map((p) => ({
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            name: p.product?.name,
            requested: String(p.quantity),
          })),
          balances,
        );

        // Cost-of-goods basis for the supplier return: goods LEAVE inventory,
        // so the value removed is the store's current WEIGHTED-AVERAGE unit
        // cost (Stock.costBalanceMinor ÷ qty-on-hand) — NOT the document price.
        // Using the price (the old code did `priceAfterDisc`) corrupted
        // Stock.costBalanceMinor whenever return price ≠ carrying cost (could
        // even drive it negative). Same basis as Loss (3add5a13) and the
        // `balances` already locked above. Frozen onto p.costMinor so unpost/
        // cancel reverse the identical value (cost zero-sum).
        const perUnitByPos = new Map<string, bigint>();
        for (const p of existing.positions) {
          const bal = balances.get(p.assortmentId);
          const onHand = bal?.qty ?? '0';
          const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
          perUnitByPos.set(p.id, costBal > 0n ? computePerUnitCost(costBal, onHand) : 0n);
        }

        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = perUnitByPos.get(p.id) ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -valueMinor,
            docType: 'purchasereturn',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          };
        });

        // Freeze the per-unit cost so unpost/cancel reverse the exact value.
        for (const p of existing.positions) {
          await tx.purchaseReturnPosition.update({
            where: { id: p.id },
            data: { costMinor: perUnitByPos.get(p.id) ?? 0n },
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'posted', applicable: true, postedAt: new Date() },
        });

        // Cascade to PO through linked Supply
        if (existing.supply?.purchaseOrderId) {
          const poDeltas = await this.buildPoDeltas(tx, existing);
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.supply.purchaseOrderId,
              poDeltas,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft allowed (current: ${existing.state})`);
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A concurrent unpost/cancel
        // blocks on the row lock, then sees count 0 → clean 409 — never a second
        // stock reversal.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Qaytarish 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        const deltas: StockDelta[] = existing.positions.map((p) => {
          // Reverse the WEIGHTED-AVERAGE cost frozen at post-time (p.costMinor),
          // not the document price — cost zero-sum with post().
          const costPerUnit = p.costMinor ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(p.quantity),
            costDeltaMinor: valueMinor,
            docType: 'purchasereturn_unpost',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          };
        });

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null },
        });

        if (existing.supply?.purchaseOrderId) {
          const poDeltas = await this.buildPoDeltas(tx, existing);
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.supply.purchaseOrderId,
              poDeltas,
              'receive',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: {
              from: { before: 'posted', after: 'draft' },
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: claim the EXACT snapshotted state→cancelled so a
        // concurrent unpost (posted→draft) that already ran makes this count 0 →
        // 409, never a double stock reversal.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: existing.state },
          data: { state: 'cancelled' },
        });
        if (claim.count === 0) {
          throw new ConflictException("Qaytarish holati o'zgargan (allaqachon o'zgartirilgan)");
        }

        const wasApplicable = existing.applicable;

        if (wasApplicable) {
          const deltas: StockDelta[] = existing.positions.map((p) => {
            // Reverse the frozen weighted-average cost (cost zero-sum with post).
            const costPerUnit = p.costMinor ?? 0n;
            const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
            return {
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              qtyDelta: String(p.quantity),
              costDeltaMinor: valueMinor,
              docType: 'purchasereturn_cancel',
              docId: id,
              docPositionId: p.id,
              reason: 'cancel',
            };
          });
          await this.stock.applyDeltas(tx, accountId, userId, deltas);

          if (existing.supply?.purchaseOrderId) {
            const poDeltas = await this.buildPoDeltas(tx, existing);
            if (poDeltas.length > 0) {
              await this.po.applyReceipt(
                tx,
                accountId,
                userId,
                existing.supply.purchaseOrderId,
                poDeltas,
                'receive',
              );
            }
          }
        }

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'cancelled', applicable: false },
        });

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: existing.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  // =====================================================================
  // helpers
  // =====================================================================

  /**
   * Build per-PO-position deltas for a PurchaseReturn, resolving
   * supplyPositionId → PO position via each linked SupplyPosition's
   * purchaseOrderPositionId.
   */
  private async buildPoDeltas(
    tx: Prisma.TransactionClient,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ): Promise<Array<{ positionId: string; qtyDelta: string; valueMinor: bigint }>> {
    const linkedPositions = existing.positions.filter((p) => p.supplyPositionId);
    if (linkedPositions.length === 0) return [];

    const supplyPositions = await tx.supplyPosition.findMany({
      where: { id: { in: linkedPositions.map((p) => p.supplyPositionId as string) } },
      select: { id: true, purchaseOrderPositionId: true },
    });
    const spMap = new Map(
      supplyPositions.map((sp) => [sp.id, sp.purchaseOrderPositionId] as const),
    );

    return linkedPositions
      .map((p) => {
        const poPositionId = spMap.get(p.supplyPositionId as string);
        if (!poPositionId) return null;
        // Single-round the reverted line value through the shared helper so the
        // PO.receivedSum revert matches the same rounding as the PO header
        // sumMinor (b1eae7be) — consistent with supply's receive/revert cascade.
        const { totalMinor } = computePositionTotal(
          {
            quantity: String(p.quantity),
            priceMinor: String(p.priceMinor),
            discount: String(p.discount),
            vat: p.vat,
          },
          existing.vatEnabled && p.vatEnabled,
          existing.vatIncluded,
        );
        return { positionId: poPositionId, qtyDelta: String(p.quantity), valueMinor: totalMinor };
      })
      .filter((d): d is { positionId: string; qtyDelta: string; valueMinor: bigint } => d != null);
  }

  private parseCreate(raw: unknown): CreatePurchaseReturnInput {
    const r = CreatePurchaseReturnSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdatePurchaseReturnInput {
    const r = UpdatePurchaseReturnSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const [agent, org, store] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: storeId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException("Ta'minlovchi topilmadi");
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async ensureSupply(accountId: string, supplyId: string): Promise<void> {
    const s = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!s) throw new BadRequestException('Supply topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'purchasereturn',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.purchaseReturn.findMany({
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

  private computeTotals(
    positions: Array<{
      quantity: unknown;
      priceMinor: bigint;
      discount: unknown;
      vat: number | null;
      vatEnabled: boolean;
    }>,
    docVatEnabled: boolean,
    vatIncluded: boolean,
  ): ComputedTotals {
    let sumMinor = 0n;
    let vatSumMinor = 0n;

    for (const p of positions) {
      const { totalMinor, vatAmountMinor } = computePositionTotal(
        {
          quantity: String(p.quantity),
          priceMinor: String(p.priceMinor),
          discount: String(p.discount ?? '0'),
          vat: p.vat ?? null,
        },
        docVatEnabled && p.vatEnabled,
        vatIncluded,
      );
      sumMinor += totalMinor;
      vatSumMinor += vatAmountMinor;
    }
    return { sumMinor, vatSumMinor };
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
        entity: 'PurchaseReturn',
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
        `Bu qiymat bilan qaytarish allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
