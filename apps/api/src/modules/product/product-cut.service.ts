import type { Prisma } from '@moysklad/db';
import { scaleMinorByQty } from '@moysklad/money';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { computePerUnitCost } from '../shared/decimal.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import { allocateAssortmentCode } from './product-code.util.js';
import {
  CutRequestSchema,
  distributeCutCost,
  lengthToMm,
  mmToLength,
  normalizeLengthM,
  prorateMinorByLength,
  remnantName,
  validateCutBudget,
} from './product-cut.schema.js';

/**
 * «Раскрой» — cut N whole meter-good pieces into shorter remnant pieces.
 *
 * One Serializable transaction produces the full paper trail the stock
 * engine already knows how to reverse:
 *   - a POSTED Списание (Loss) for the consumed source pieces, valued at the
 *     store weighted-average (else buyPrice) — the same basis LossService.post
 *     books (066d55fb valuation parity);
 *   - a POSTED Оприходование (Enter) for the remnant pieces, carrying the
 *     USED share of that cost (waste stays expensed on the Loss);
 *   - remnant products find-or-created inside the same tx, keyed by
 *     attributes {cutSourceId, cutLengthM} — NO schema migration;
 *   - ONE stock.applyDeltas call for both directions, so store + per-cell
 *     (StockByCell) balances move atomically.
 *
 * Quantities never come from hand-entry — only from these documents — so the
 * «Отрезы» card cannot drift from reality (same rule as «Место хранения»).
 */
@Injectable()
export class ProductCutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async cut(accountId: string, userId: string, sourceId: string, raw: unknown) {
    const parsed = CutRequestSchema.parse(raw);
    // The controller decorator covers loss.create; the operation also books an
    // Enter and may create remnant products — require those explicitly too.
    await this.perms.require(userId, 'enter', 'create');
    await this.perms.require(userId, 'product', 'create');

    const source = await this.prisma.client.product.findFirst({
      where: { id: sourceId, accountId, deletedAt: null },
    });
    if (!source) throw new NotFoundException('Tovar topilmadi');
    if (source.kind !== 'product') {
      throw new BadRequestException('Faqat oddiy tovar (product) kesiladi');
    }

    const [org, store] = await Promise.all([
      this.prisma.client.organization.findFirst({
        where: { id: parsed.organizationId, accountId },
        select: { id: true },
      }),
      this.prisma.client.store.findFirst({
        where: { id: parsed.storeId, accountId },
        select: { id: true, allowNegativeStock: true },
      }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');

    const cellIds = [parsed.sourceCellId, ...parsed.pieces.map((p) => p.cellId)];
    await this.stock.assertCellsInStore(accountId, parsed.storeId, cellIds);

    const srcLen = normalizeLengthM(parsed.sourceLengthM);
    const pieces = parsed.pieces.map((p) => ({ ...p, lengthM: normalizeLengthM(p.lengthM) }));
    let budget: ReturnType<typeof validateCutBudget>;
    try {
      budget = validateCutBudget(srcLen, parsed.consumedQty, pieces);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Denormalized «Ячейка» display labels for the position rows.
    const cellNameById = new Map<string, string>();
    {
      const ids = cellIds.filter((x): x is string => !!x);
      if (ids.length > 0) {
        const rows = await this.prisma.client.storeCell.findMany({
          where: { accountId, id: { in: ids } },
          select: { id: true, name: true },
        });
        for (const r of rows) cellNameById.set(r.id, r.name);
      }
    }

    // Remnants chain to the ROOT product so second-generation cuts (cutting a
    // remnant) merge into the same family instead of nesting «отрез — отрез».
    const attrs = (source.attributes ?? {}) as Record<string, unknown>;
    let rootId = source.id;
    let rootName = source.name;
    if (typeof attrs.cutSourceId === 'string') {
      const root = await this.prisma.client.product.findFirst({
        where: { id: attrs.cutSourceId, accountId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (root) {
        rootId = root.id;
        rootName = root.name;
      }
    }

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const year = new Date().getFullYear();
    const lossPrefix = `СП-${year}-`;
    const srcMm = lengthToMm(srcLen);

    const result = await this.prisma.client.$transaction(
      async (tx) => {
        // ---- sufficiency (same lock + assert the Loss post path uses) ----
        const balances = await this.stock.lockBalances(tx, accountId, parsed.storeId, [
          { kind: 'product', id: source.id },
        ]);
        this.stock.assertAvailable(
          store.allowNegativeStock,
          [
            {
              assortmentKind: 'product',
              assortmentId: source.id,
              name: source.name,
              requested: String(parsed.consumedQty),
            },
          ],
          balances,
        );

        // ---- consumed cost basis (weighted-average, else buyPrice) ----
        const bal = balances.get(source.id);
        const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
        const perUnit =
          costBal > 0n ? computePerUnitCost(costBal, bal?.qty ?? '0') : (source.buyPrice ?? 0n);
        const totalConsumedCost = scaleMinorByQty(perUnit, String(parsed.consumedQty));
        const split = distributeCutCost(totalConsumedCost, budget.budgetMm, pieces);

        // ---- find-or-create remnant products (one per distinct length) ----
        type SalePrice = { priceTypeId: string; value: string; currencyCode?: string };
        const sourcePrices = (Array.isArray(source.salePrices)
          ? source.salePrices
          : []) as unknown as SalePrice[];
        const remnantByLength = new Map<string, { id: string; name: string; created: boolean }>();
        for (const piece of pieces) {
          if (remnantByLength.has(piece.lengthM)) continue;
          const existing = await tx.product.findFirst({
            where: {
              accountId,
              deletedAt: null,
              AND: [
                { attributes: { path: ['cutSourceId'], equals: rootId } },
                { attributes: { path: ['cutLengthM'], equals: piece.lengthM } },
              ],
            },
            select: { id: true, name: true },
          });
          if (existing) {
            remnantByLength.set(piece.lengthM, { ...existing, created: false });
            continue;
          }
          const pieceMm = lengthToMm(piece.lengthM);
          const remnantCode = await allocateAssortmentCode(tx, accountId);
          const created = await tx.product.create({
            data: {
              accountId,
              ownerId: userId,
              modifiedById: userId,
              name: remnantName(rootName, piece.lengthM),
              code: remnantCode,
              kind: 'product',
              uom: source.uom,
              productFolderId: source.productFolderId,
              groupId: creatorGroupId,
              shared: source.shared,
              vat: source.vat,
              vatEnabled: source.vatEnabled,
              useParentVat: source.useParentVat,
              // Money prorated by length from the piece being cut (not the root):
              // a 2.5м offcut of a 4м pipe costs/sells at 2.5/4 of the source.
              buyPrice:
                source.buyPrice != null
                  ? prorateMinorByLength(source.buyPrice, pieceMm, srcMm)
                  : null,
              buyPriceCurrency: source.buyPriceCurrency,
              salePrices: sourcePrices.length
                ? (sourcePrices.map((sp) => ({
                    ...sp,
                    value: prorateMinorByLength(
                      BigInt(String(sp.value)),
                      pieceMm,
                      srcMm,
                    ).toString(),
                  })) as unknown as Prisma.InputJsonValue)
                : undefined,
              attributes: {
                cutSourceId: rootId,
                cutLengthM: piece.lengthM,
              } as Prisma.InputJsonValue,
            },
            select: { id: true, name: true },
          });
          await tx.auditLog.create({
            data: {
              accountId,
              userId,
              entity: 'Product',
              entityId: created.id,
              action: 'create',
              fieldChanges: { cutSourceId: rootId } as Prisma.InputJsonValue,
            },
          });
          remnantByLength.set(piece.lengthM, { ...created, created: true });
        }

        // ---- document numbers (atomic counters, same keys the services use) ----
        const lossN = await allocateDocumentNumber(tx, accountId, lossPrefix, async () => {
          const last = await tx.loss.findFirst({
            where: { accountId, name: { startsWith: lossPrefix } },
            orderBy: { name: 'desc' },
            select: { name: true },
          });
          return last ? Number.parseInt(last.name.slice(lossPrefix.length), 10) || 0 : 0;
        });
        const lossName = `${lossPrefix}${String(lossN).padStart(5, '0')}`;
        const enterN = await allocateDocumentNumber(tx, accountId, 'enter', async () => {
          const rows = await tx.enter.findMany({ where: { accountId }, select: { name: true } });
          let max = 0;
          for (const r of rows) {
            const m = r.name.match(/\d+$/);
            if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
          }
          return max;
        });
        const enterName = String(enterN).padStart(5, '0');

        const wasteNote = budget.wasteMm > 0n ? `; отход ${mmToLength(budget.wasteMm)} м` : '';
        const userNote = parsed.description ? `. ${parsed.description}` : '';
        const cutLabel = `Раскрой: ${source.name}, ${parsed.consumedQty} × ${srcLen} м`;
        const moment = new Date();

        // ---- POSTED Списание (consumed source pieces) ----
        const loss = await tx.loss.create({
          data: {
            accountId,
            ownerId: userId,
            groupId: creatorGroupId,
            name: lossName,
            organizationId: parsed.organizationId,
            storeId: parsed.storeId,
            moment,
            reason: 'other',
            description: `${cutLabel} → Оприходование № ${enterName}${wasteNote}${userNote}`,
            state: 'posted',
            applicable: true,
            postedAt: moment,
            sumMinor: totalConsumedCost,
            positions: {
              create: [
                {
                  accountId,
                  position: 1,
                  assortmentKind: 'product',
                  assortmentId: source.id,
                  productId: source.id,
                  quantity: String(parsed.consumedQty),
                  reason: 'Раскрой',
                  cellId: parsed.sourceCellId ?? null,
                  cell: parsed.sourceCellId
                    ? (cellNameById.get(parsed.sourceCellId) ?? null)
                    : null,
                  // Freeze the per-unit basis exactly like LossService.post so
                  // a later unpost/cancel reverses the identical value.
                  costMinor: perUnit,
                },
              ],
            },
          },
          include: { positions: true },
        });

        // ---- POSTED Оприходование (remnant pieces) ----
        const enter = await tx.enter.create({
          data: {
            accountId,
            ownerId: userId,
            modifiedById: userId,
            groupId: creatorGroupId,
            shared: false,
            name: enterName,
            organizationId: parsed.organizationId,
            storeId: parsed.storeId,
            currency: 'UZS',
            rateValue: BigInt('100000000'),
            moment,
            description: `${cutLabel} → отрезы (Списание № ${lossName})${wasteNote}${userNote}`,
            overheadSumMinor: 0n,
            overheadDistribution: 'WEIGHT',
            overheadCurrency: 'UZS',
            state: 'posted',
            applicable: true,
            postedAt: moment,
            sumMinor: split.usedMinor,
            positions: {
              create: pieces.map((p, idx) => {
                const remnant = remnantByLength.get(p.lengthM);
                if (!remnant) throw new Error(`remnant missing for length ${p.lengthM}`);
                const line = split.lineShares[idx] ?? 0n;
                return {
                  accountId,
                  position: idx + 1,
                  assortmentKind: 'product',
                  assortmentId: remnant.id,
                  productId: remnant.id,
                  quantity: String(p.quantity),
                  // «Цена» is per-unit; the ledger uses the exact line share below.
                  costMinor: computePerUnitCost(line, String(p.quantity)),
                  reason: 'Раскрой',
                  cellId: p.cellId ?? null,
                  cell: p.cellId ? (cellNameById.get(p.cellId) ?? null) : null,
                };
              }),
            },
          },
          include: { positions: { orderBy: { position: 'asc' } } },
        });

        // ---- ONE atomic stock move: − source, + remnants (store + cells) ----
        const lossPos = loss.positions[0];
        if (!lossPos) throw new Error('loss position missing');
        const deltas: StockDelta[] = [
          {
            storeId: parsed.storeId,
            assortmentKind: 'product',
            assortmentId: source.id,
            cellId: parsed.sourceCellId ?? null,
            qtyDelta: `-${parsed.consumedQty}`,
            costDeltaMinor: -totalConsumedCost,
            docType: 'loss',
            docId: loss.id,
            docPositionId: lossPos.id,
            reason: 'post',
          },
          ...enter.positions.map((p, idx) => ({
            storeId: parsed.storeId,
            assortmentKind: 'product',
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: String(p.quantity),
            costDeltaMinor: split.lineShares[idx] ?? 0n,
            docType: 'enter',
            docId: enter.id,
            docPositionId: p.id,
            reason: 'post' as const,
          })),
        ];
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // ---- audit trail (create + posted, per document) ----
        for (const [entity, entityId] of [
          ['Loss', loss.id],
          ['Enter', enter.id],
        ] as const) {
          await tx.auditLog.create({
            data: { accountId, userId, entity, entityId, action: 'create' },
          });
          await tx.auditLog.create({
            data: {
              accountId,
              userId,
              entity,
              entityId,
              action: 'transition:posted',
              fieldChanges: { from: { before: 'draft', after: 'posted' } } as Prisma.InputJsonValue,
            },
          });
        }

        // ---- remember the source piece length for the next cut's prefill ----
        if (attrs.cutLengthM !== srcLen) {
          await tx.product.update({
            where: { id: source.id, accountId },
            data: {
              attributes: { ...attrs, cutLengthM: srcLen } as Prisma.InputJsonValue,
              modifiedBy: { connect: { id: userId } },
            },
          });
        }

        return {
          loss: { id: loss.id, name: loss.name },
          enter: { id: enter.id, name: enter.name },
          wasteM: mmToLength(budget.wasteMm),
          remnants: pieces.map((p) => {
            const r = remnantByLength.get(p.lengthM);
            return {
              productId: r?.id ?? '',
              name: r?.name ?? '',
              lengthM: p.lengthM,
              quantity: p.quantity,
              createdProduct: r?.created ?? false,
            };
          }),
        };
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );

    this.webhookFire.fireForEvent(accountId, 'loss', 'CREATE', result.loss.id);
    this.webhookFire.fireForEvent(accountId, 'enter', 'CREATE', result.enter.id);
    return result;
  }

  /**
   * «Отрезы» card feed: the remnant family of this product (itself when it is
   * the root, or its root's family when the product IS a remnant), each with
   * live total stock. Read-only — quantities come from Stock (documents only).
   */
  async cuts(accountId: string, productId: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true, name: true, attributes: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const rootId = typeof attrs.cutSourceId === 'string' ? attrs.cutSourceId : product.id;

    const [root, remnants] = await Promise.all([
      rootId === product.id
        ? Promise.resolve({
            id: product.id,
            name: product.name,
            attributes: product.attributes,
          })
        : this.prisma.client.product.findFirst({
            where: { id: rootId, accountId, deletedAt: null },
            select: { id: true, name: true, attributes: true },
          }),
      this.prisma.client.product.findMany({
        where: {
          accountId,
          deletedAt: null,
          attributes: { path: ['cutSourceId'], equals: rootId },
        },
        select: { id: true, name: true, code: true, uom: true, attributes: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const ids = remnants.map((r) => r.id);
    const qtyById = new Map<string, string>();
    if (ids.length > 0) {
      const sums = await this.prisma.client.stock.groupBy({
        by: ['assortmentId'],
        where: { accountId, assortmentKind: 'product', assortmentId: { in: ids } },
        _sum: { qty: true },
      });
      for (const s of sums) qtyById.set(s.assortmentId, (s._sum.qty ?? 0).toString());
    }

    const rootAttrs = (root?.attributes ?? {}) as Record<string, unknown>;
    return {
      root: root ? { id: root.id, name: root.name } : null,
      sourceLengthM: typeof rootAttrs.cutLengthM === 'string' ? rootAttrs.cutLengthM : null,
      items: remnants.map((r) => {
        const ra = (r.attributes ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          uom: r.uom,
          lengthM: typeof ra.cutLengthM === 'string' ? ra.cutLengthM : null,
          qty: qtyById.get(r.id) ?? '0',
        };
      }),
    };
  }
}
