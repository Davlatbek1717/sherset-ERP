import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { computeTransferCost } from '../shared/move-cost-basis.js';
import { type StockBalance, StockService } from '../stock/stock.service.js';
import { CellMoveSchema, CellPlaceSchema, CellRebindSchema } from './product-cell-move.schema.js';

/**
 * «Переместить по ячейкам» — move a product between address-storage cells.
 *
 * SAME warehouse  → pure per-cell redistribution: the two deltas net to zero at
 *                   store level, so total on-hand and cost are untouched; only
 *                   StockByCell moves.
 * OTHER warehouse → a real transfer: the source warehouse loses N (and its
 *                   weighted-average cost of N), the target warehouse gains them
 *                   — the store-level Stock qty AND cost move with the units, plus
 *                   StockByCell on both sides. Same cost basis MoveService books.
 *
 * Both go through the central stock engine (`applyDeltas`) — one ledger pair tied
 * by a shared docId, reversible like every other movement. Quantities are
 * documents-only (never hand-entered), so the balance can't drift.
 */
@Injectable()
export class ProductCellMoveService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  /**
   * Weighted-average cost (tiyin) of `qty` units at the SOURCE store — the value
   * that travels with the units on a cross-warehouse transfer. Shares
   * MoveService's exact helper (Faza 34 / STK-08): the source qty is parsed as
   * an exact Decimal(20,6) rather than `Math.round(Number(qty) × 1e6)`, and a
   * move that empties the source takes the whole costBalanceMinor instead of
   * round(perUnit) × qty — which used to strand a few tiyin on a qty = 0 row.
   * 0 when the source has no cost basis / no stock.
   */
  private costOfUnits(bal: StockBalance | undefined, qty: string): bigint {
    return computeTransferCost({
      sourceCostBalanceMinor: bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n,
      sourceQty: bal?.qty ? String(bal.qty) : '0',
      moveQty: qty,
    }).baseLineMinor;
  }

  /** Resolve a target cell to its store (tenant-scoped). Throws if absent. */
  private async resolveTargetStore(accountId: string, cellId: string): Promise<string> {
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, accountId },
      select: { storeId: true },
    });
    if (!cell) throw new BadRequestException('Yacheyka topilmadi');
    return cell.storeId;
  }

  async move(accountId: string, userId: string, productId: string, raw: unknown) {
    const parsed = CellMoveSchema.parse(raw);

    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const fromStore = parsed.storeId;
    // Source cell must be in the source store; target may be in ANY warehouse.
    await this.stock.assertCellsInStore(accountId, fromStore, [parsed.fromCellId]);
    const toStore = await this.resolveTargetStore(accountId, parsed.toCellId);
    const crossStore = toStore !== fromStore;

    const docId = randomUUID();
    await this.prisma.client.$transaction(
      async (tx) => {
        // Lock the SOURCE store's balance — serialises concurrent moves of this
        // product (source sufficiency) and gives the weighted-average cost basis.
        const balances = await this.stock.lockBalances(tx, accountId, fromStore, [
          { kind: 'product', id: productId },
        ]);

        // Fresh source-cell balance under the lock — a bin can never go negative.
        const fromRow = await tx.stockByCell.findUnique({
          where: {
            accountId_storeId_cellId_assortmentKind_assortmentId: {
              accountId,
              storeId: fromStore,
              cellId: parsed.fromCellId,
              assortmentKind: 'product',
              assortmentId: productId,
            },
          },
          select: { qty: true },
        });
        if (!fromRow || fromRow.qty.lessThan(parsed.qty)) {
          throw new BadRequestException("Yacheykada yetarli miqdor yo'q");
        }

        const costOfN = crossStore ? this.costOfUnits(balances.get(productId), parsed.qty) : 0n;
        await this.stock.applyDeltas(tx, accountId, userId, [
          {
            storeId: fromStore,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: parsed.fromCellId,
            qtyDelta: `-${parsed.qty}`,
            costDeltaMinor: crossStore ? -costOfN : null,
            docType: 'cell_move',
            docId,
            reason: 'post',
          },
          {
            storeId: toStore,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: parsed.toCellId,
            qtyDelta: parsed.qty,
            costDeltaMinor: crossStore ? costOfN : null,
            docType: 'cell_move',
            docId,
            reason: 'post',
          },
        ]);
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );

    return { ok: true, crossStore, fromCellId: parsed.fromCellId, toCellId: parsed.toCellId };
  }

  /**
   * «Переместить» on a HOME-CELL binding row (LABEL model) — re-assign the
   * product's home cell to another StoreCell. Pure label move: updates the
   * product's attributes `__yacheyka` (cell name) + `__polka` (its zone/полка).
   * No stock moves (the binding is a location hint, not a per-cell balance), so
   * this can never touch the ledger. Gated `product.update` (it edits the card).
   *
   * Multi-bin (2026-08-06): this is a deliberate MOVE (unlike `assignProducts`,
   * which only ADDS) — the old home cell's ProductCellLink row is dropped and
   * the new one created, so the product genuinely leaves the old cell's
   * contents. Any OTHER cells it's separately bound to are untouched.
   */
  async rebind(accountId: string, _userId: string, productId: string, raw: unknown) {
    const { toCellId } = CellRebindSchema.parse(raw);

    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true, attributes: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: toCellId, accountId },
      select: { name: true, zone: { select: { name: true } } },
    });
    if (!cell) throw new BadRequestException('Yacheyka topilmadi');

    // «Полка» — the cell's zone; legacy zone-less cells fall back to the code's
    // 2nd segment (mirrors ProductRepository.attachStorageCells).
    const polka = cell.zone?.name ?? cell.name.split('-')[1] ?? '';
    const attrs = { ...((product.attributes as Record<string, unknown>) ?? {}) };
    const oldHomeName = typeof attrs.__yacheyka === 'string' ? attrs.__yacheyka : null;
    attrs.__yacheyka = cell.name;
    attrs.__polka = polka;

    await this.prisma.client.product.update({
      where: { id: productId, accountId },
      data: { attributes: attrs as Prisma.InputJsonValue },
    });

    if (oldHomeName && oldHomeName !== cell.name) {
      const oldCell = await this.prisma.client.storeCell.findFirst({
        where: { accountId, name: oldHomeName },
        select: { id: true },
      });
      if (oldCell) {
        await this.prisma.client.productCellLink.deleteMany({
          where: { accountId, productId, cellId: oldCell.id },
        });
      }
    }
    await this.prisma.client.productCellLink.upsert({
      where: { productId_cellId: { productId, cellId: toCellId } },
      create: { accountId, productId, cellId: toCellId },
      update: {},
    });

    return { ok: true, cellName: cell.name, polka };
  }

  /**
   * «Переместить» qty from the HOME-CELL remainder into a target cell. The home
   * cell (resolved from attributes) holds the product's UNALLOCATED on-hand in its
   * store = store stock − Σ(StockByCell in that store). Placing N moves N out of
   * that pool:
   *   SAME store  → StockByCell[target] += N; store stock unchanged (remainder −N).
   *   OTHER store → source warehouse loses N (+cost), target warehouse gains N
   *                 (+cost) and StockByCell[target] += N — a real transfer.
   * Guard: N must not exceed the remainder (a warehouse can't ship what it lacks).
   */
  async place(accountId: string, userId: string, productId: string, raw: unknown) {
    const parsed = CellPlaceSchema.parse(raw);

    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true, attributes: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const attrs = (product.attributes as Record<string, unknown>) ?? {};
    const homeCellName = typeof attrs.__yacheyka === 'string' ? attrs.__yacheyka : null;
    const homePolka = typeof attrs.__polka === 'string' ? attrs.__polka : null;
    if (!homeCellName) throw new BadRequestException('Asosiy yacheyka belgilanmagan');

    const homeCell = await this.prisma.client.storeCell.findFirst({
      where: { accountId, name: homeCellName, ...(homePolka ? { zone: { name: homePolka } } : {}) },
      select: { id: true, storeId: true },
    });
    if (!homeCell) throw new BadRequestException('Asosiy yacheyka haqiqiy yacheyka emas');
    if (parsed.toCellId === homeCell.id) throw new BadRequestException('Boshqa yacheyka tanlang');

    const fromStore = homeCell.storeId;
    const toStore = await this.resolveTargetStore(accountId, parsed.toCellId);
    const crossStore = toStore !== fromStore;

    const docId = randomUUID();
    await this.prisma.client.$transaction(
      async (tx) => {
        const balances = await this.stock.lockBalances(tx, accountId, fromStore, [
          { kind: 'product', id: productId },
        ]);

        // Fresh remainder under the lock = source-store stock − already-placed.
        const [storeStock, alloc] = await Promise.all([
          tx.stock.findUnique({
            where: {
              accountId_storeId_assortmentKind_assortmentId: {
                accountId,
                storeId: fromStore,
                assortmentKind: 'product',
                assortmentId: productId,
              },
            },
            select: { qty: true },
          }),
          tx.stockByCell.aggregate({
            where: {
              accountId,
              storeId: fromStore,
              assortmentKind: 'product',
              assortmentId: productId,
            },
            _sum: { qty: true },
          }),
        ]);
        const remainder = storeStock
          ? alloc._sum.qty
            ? storeStock.qty.minus(alloc._sum.qty)
            : storeStock.qty
          : null;
        if (!remainder || remainder.lessThan(parsed.qty)) {
          throw new BadRequestException("Yacheykada yetarli miqdor yo'q");
        }

        const costOfN = crossStore ? this.costOfUnits(balances.get(productId), parsed.qty) : 0n;
        // Source delta comes off the store's UNALLOCATED pool (remainder =
        // store stock − Σ StockByCell), NOT a specific bin — so it must be
        // `cellMode: 'store-only'`. Ilgari cellId:null edi, lekin outbound
        // auto-deduct (054ff32) uni band yacheykadan yechardi ⇒ mavjud bin
        // talanardi (remainder emas). Same store ⇒ the +N target cancels it at
        // store level (store unchanged, remainder −N); other store ⇒ source
        // warehouse really loses N. (2026-07-29 per-cell drift-fix.)
        await this.stock.applyDeltas(tx, accountId, userId, [
          {
            storeId: fromStore,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: null,
            cellMode: 'store-only',
            qtyDelta: `-${parsed.qty}`,
            costDeltaMinor: crossStore ? -costOfN : null,
            docType: 'cell_place',
            docId,
            reason: 'post',
          },
          {
            storeId: toStore,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: parsed.toCellId,
            qtyDelta: parsed.qty,
            costDeltaMinor: crossStore ? costOfN : null,
            docType: 'cell_place',
            docId,
            reason: 'post',
          },
        ]);
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );

    return { ok: true, crossStore, toCellId: parsed.toCellId, qty: parsed.qty };
  }
}
