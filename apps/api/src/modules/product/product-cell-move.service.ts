import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertCellStockEmpty } from '../shared/cell-stock-guard.js';
import { parseDecimalScaled } from '../shared/decimal.js';
import { computeTransferCost } from '../shared/move-cost-basis.js';
import { PlacementSource, allocatePlacement, totalTakenMicro } from '../shared/pool-placement.js';
import { findPoolStore, sumAssignedByAssortment } from '../stock/pool-store.util.js';
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
   *
   * ⚠️ QOLDIQ QULFI (egasi 2026-08-11 · Q1; review 2026-08-11 Critical).
   * «No stock moves … can never touch the ledger» yuqoridagi jumla TO'G'RI-yu,
   * ADASHTIRUVCHI edi: bu metod hisob kitobiga tegmaydi, lekin BOG'LANISHNI
   * uzadi — va aynan shu fantom qoldiq tug'diradi (link/yorliq ketadi,
   * `StockByCell` qatori qoladi, keyingi «Umumiy sanash» uning USTIGA
   * qo'shadi). Egasining qarori qaysi yo'ldan kelishidan qat'i nazar amal
   * qiladi, shuning uchun bu yo'l ham `assertCellStockEmpty` dan o'tadi —
   * `StoreAddressService.unassignProduct` bilan BIR XIL qoida, bir manbadan.
   *
   * BUTUN amal rad etiladi (faqat link o'chirish emas): `__yacheyka` yorlig'i
   * — bog'lanishning IKKINCHI manbai (`getCellProducts`/`getCellStock`/
   * `getAddressStorage` nom bo'yicha ham moslaydi), ya'ni yorliqni ko'chirish
   * o'zi ham xuddi shu nomuvofiqlikni tug'dirardi.
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

    // Qulf + yozuvlar BITTA serializable tranzaksiyada: aks holda tekshiruv
    // bilan o'chirish orasida boshqa sessiya sanoq yozib ulgurardi va fantom
    // baribir tug'ilardi (`move()`/`place()` dagi bir xil naqsh).
    await this.prisma.client.$transaction(
      async (tx) => {
        // Eski uy-yacheyka AVVAL yechiladi — qulf har qanday yozuvdan OLDIN
        // ishlashi shart (ilgari `product.update` birinchi bajarilardi).
        const oldCell =
          oldHomeName && oldHomeName !== cell.name
            ? await tx.storeCell.findFirst({
                where: { accountId, name: oldHomeName },
                select: { id: true, name: true, storeId: true },
              })
            : null;
        if (oldCell) {
          await assertCellStockEmpty(tx, {
            accountId,
            storeId: oldCell.storeId,
            cellId: oldCell.id,
            cellName: oldCell.name,
            productId,
          });
        }

        await tx.product.update({
          where: { id: productId, accountId },
          data: { attributes: attrs as Prisma.InputJsonValue },
        });

        if (oldCell) {
          await tx.productCellLink.deleteMany({
            where: { accountId, productId, cellId: oldCell.id },
          });
        }
        await tx.productCellLink.upsert({
          where: { productId_cellId: { productId, cellId: toCellId } },
          create: { accountId, productId, cellId: toCellId },
          update: {},
        });
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );

    return { ok: true, cellName: cell.name, polka };
  }

  /**
   * «Переместить» qty from the UNALLOCATED remainder into a target cell.
   *
   * F7 (2026-08-24): manba endi BITTA emas — tartiblangan RO'YXAT:
   *   1. maqsad yacheyka OMBORINING o'z yacheykasiz qoldig'i (masalan Move
   *      hujjati bilan kelib hali joylashtirilmagan tovar) — store jami
   *      o'zgarmaydi, faqat StockByCell[target] += N;
   *   2. `__unassignedSource` hovuz-ombori («Taqsimlanmagan») — haqiqiy
   *      omborlararo transfer: qty ham tannarx ham ko'chadi;
   *   3. eski xulq: tovar uy-yacheykasining ombori (hovuz belgilanmagan
   *      akkauntlar shu yo'ldan avvalgidek yuraveradi).
   * Bitta joylashtirish bir nechta manbadan BO'LINIB kelishi mumkin; jami
   * yetmasa butun amal rad etiladi. Har manba uchun juft delta (`cell_place`,
   * bitta docId): manba tomoni `cellMode:'store-only'` (remainder — aniq bin
   * emas), maqsad tomoni `cellId`. (2026-07-29 per-cell drift-fix saqlanadi.)
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

    const pool = await findPoolStore(this.prisma.client, accountId);
    // Uy-yacheyka endi MAJBURIY emas: hovuz belgilangan bo'lsa usiz ham
    // joylashtirsa bo'ladi. Hovuzsiz akkauntda eski talab va xatolar saqlanadi.
    const homeCell = homeCellName
      ? await this.prisma.client.storeCell.findFirst({
          where: {
            accountId,
            name: homeCellName,
            ...(homePolka ? { zone: { name: homePolka } } : {}),
          },
          select: { id: true, storeId: true },
        })
      : null;
    if (!pool) {
      if (!homeCellName) throw new BadRequestException('Asosiy yacheyka belgilanmagan');
      if (!homeCell) throw new BadRequestException('Asosiy yacheyka haqiqiy yacheyka emas');
    }
    if (homeCell && parsed.toCellId === homeCell.id) {
      throw new BadRequestException('Boshqa yacheyka tanlang');
    }

    const toStore = await this.resolveTargetStore(accountId, parsed.toCellId);
    // Manba omborlar PRIORITET tartibida (takrorsiz): o'z ombori → hovuz → uy.
    const sourceStoreIds: string[] = [toStore];
    if (pool && !sourceStoreIds.includes(pool.id)) sourceStoreIds.push(pool.id);
    if (homeCell && !sourceStoreIds.includes(homeCell.storeId)) {
      sourceStoreIds.push(homeCell.storeId);
    }

    const docId = randomUUID();
    let takenPlan: Array<{ storeId: string; qty: string; crossStore: boolean }> = [];
    await this.prisma.client.$transaction(
      async (tx) => {
        // Qulf store-id TARTIBIDA (deadlock oldini olish); manba prioriteti
        // esa quyida sourceStoreIds tartibida quriladi.
        const balByStore = new Map<string, Map<string, StockBalance>>();
        for (const sid of [...sourceStoreIds].sort()) {
          balByStore.set(
            sid,
            await this.stock.lockBalances(tx, accountId, sid, [{ kind: 'product', id: productId }]),
          );
        }
        const sources: PlacementSource[] = [];
        for (const sid of sourceStoreIds) {
          const bal = balByStore.get(sid)?.get(productId);
          const assigned = await sumAssignedByAssortment(tx, accountId, sid, [
            { kind: 'product', id: productId },
          ]);
          sources.push(
            new PlacementSource({
              storeId: sid,
              qty: bal?.qty ?? '0',
              assignedQty: assigned.get(`product|${productId}`) ?? '0',
              reservedQty: bal?.reservedQty ?? '0',
              costBalanceMinor: bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n,
              crossStore: sid !== toStore,
            }),
          );
        }

        const wantMicro = parseDecimalScaled(parsed.qty);
        const takes = allocatePlacement(sources, wantMicro);
        if (totalTakenMicro(takes) < wantMicro) {
          throw new BadRequestException("Yacheykada yetarli miqdor yo'q");
        }
        takenPlan = takes.map((t) => ({
          storeId: t.storeId,
          qty: t.qty,
          crossStore: t.crossStore,
        }));

        const deltas = takes.flatMap((t) => [
          {
            storeId: t.storeId,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: null,
            cellMode: 'store-only' as const,
            qtyDelta: `-${t.qty}`,
            costDeltaMinor: t.crossStore ? -t.costMinor : null,
            docType: 'cell_place',
            docId,
            reason: 'post' as const,
          },
          {
            storeId: toStore,
            assortmentKind: 'product',
            assortmentId: productId,
            cellId: parsed.toCellId,
            qtyDelta: t.qty,
            costDeltaMinor: t.crossStore ? t.costMinor : null,
            docType: 'cell_place',
            docId,
            reason: 'post' as const,
          },
        ]);
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );

    return {
      ok: true,
      crossStore: takenPlan.some((t) => t.crossStore),
      toCellId: parsed.toCellId,
      qty: parsed.qty,
      // F7: qaysi ombordan qancha olindi — UI/diagnostika uchun (additiv).
      sources: takenPlan,
    };
  }
}
