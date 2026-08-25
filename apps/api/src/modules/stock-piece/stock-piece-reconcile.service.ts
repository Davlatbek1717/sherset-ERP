import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type ReconReport,
  type ReconStoreStock,
  buildPieceReconciliation,
} from './stock-piece-core.js';

export const PieceReconciliationFilterSchema = z.object({
  /** Bitta ombor kesimi. Bo'sh = hamma ombor. */
  storeId: z.string().uuid().optional(),
  /** Bitta tovar kesimi (tovar kartasidan chaqirish uchun). */
  assortmentId: z.string().uuid().optional(),
  /** Faqat farq bergan qatorlar. */
  onlyDiff: z.coerce.boolean().optional(),
  /** Qator chegarasi. Kesilgani javobda `truncated` bo'lib qaytadi. */
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
export type PieceReconciliationFilter = z.infer<typeof PieceReconciliationFilterSchema>;

/**
 * K1/3-vazifa — bo'lak reyestri va qoldiq sverkasi.
 *
 * FAQAT O'QIYDI. Bu servis birorta `create/update/delete` chaqirmaydi va
 * qoldiqqa umuman tegmaydi (`warehouse-state.ts` bilan bir intizom): uning
 * vazifasi nosozlikni KO'RSATISH, tuzatish emas. Farq topilsa kassa
 * to'xtamaydi — hisobot qizil qator beradi, xolos.
 *
 * Mezon: FAQAT `pieceTracked = true` tovarlar. K1 da bayroq hech qayerda
 * yoqilmagan ⇒ hisobot bo'sh («farq yo'q») bo'lishi KUTILADIGAN natija va
 * aynan shu qabul mezonining bandi.
 */
@Injectable()
export class StockPieceReconcileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async reconcile(accountId: string, raw: unknown): Promise<ReconReport> {
    const parsed = PieceReconciliationFilterSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const filter = parsed.data;

    // Bayrog'i yoqilgan tovarlar. Bo'lak hisobi hozircha FAQAT `Product` da
    // (variantlarda bayroq yo'q) — shuning uchun sverka mezoni ham shu.
    const trackedProducts = await this.prisma.client.product.findMany({
      where: {
        accountId,
        pieceTracked: true,
        deletedAt: null,
        ...(filter.assortmentId ? { id: filter.assortmentId } : {}),
      },
      select: { id: true, name: true, code: true, uom: true },
    });
    const trackedIds = trackedProducts.map((p) => p.id);

    // Reyestrdagi bo'laklar. `pieceTracked` filtri bu yerda ATAYLAB YO'Q:
    // bayrog'i o'chirilgan, lekin bo'lagi qolgan tovar sverkada
    // `pieces-without-flag` ogohlantirishi bo'lib chiqishi kerak (IS-5 — jim
    // qolgan nosozlik). Yadro shu farqni o'zi ajratadi.
    const pieces = await this.prisma.client.stockPiece.findMany({
      where: {
        accountId,
        ...(filter.storeId ? { storeId: filter.storeId } : {}),
        ...(filter.assortmentId ? { assortmentId: filter.assortmentId } : {}),
      },
      select: {
        storeId: true,
        cellId: true,
        assortmentKind: true,
        assortmentId: true,
        length: true,
        whole: true,
        label: true,
        status: true,
      },
    });

    const stockScope = [...new Set([...trackedIds, ...pieces.map((p) => p.assortmentId)])];

    // Bayroq hech qayerda yoqilmagan va reyestr bo'sh bo'lsa (K1 dagi holat)
    // qoldiq jadvallariga umuman bormaymiz — 5000+ tovarli bazada bekorga
    // skan qilmaslik uchun.
    const [cellStock, storeStock, stores, cells] = await this.loadStock(
      accountId,
      stockScope,
      filter.storeId,
    );

    return buildPieceReconciliation({
      products: [
        ...trackedProducts.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          uom: p.uom,
          pieceTracked: true,
        })),
        ...(await this.loadUntrackedNames(accountId, trackedIds, pieces)),
      ],
      stores,
      cells,
      pieces: pieces.map((p) => ({
        storeId: p.storeId,
        cellId: p.cellId,
        assortmentKind: p.assortmentKind,
        assortmentId: p.assortmentId,
        length: p.length.toString(),
        whole: p.whole,
        label: p.label,
        status: p.status,
      })),
      cellStock,
      storeStock,
      limit: filter.limit,
      onlyDiff: filter.onlyDiff ?? false,
    });
  }

  /** Qoldiq + nom lug'atlari. Bo'sh doirada hech qanday so'rov yuborilmaydi. */
  private async loadStock(
    accountId: string,
    assortmentIds: string[],
    storeId: string | undefined,
  ): Promise<
    [
      Array<{
        storeId: string;
        cellId: string;
        assortmentKind: string;
        assortmentId: string;
        qty: string;
      }>,
      ReconStoreStock[],
      Array<{ id: string; name: string }>,
      Array<{ id: string; name: string }>,
    ]
  > {
    if (assortmentIds.length === 0) return [[], [], [], []];

    const [cellRows, storeRows] = await Promise.all([
      this.prisma.client.stockByCell.findMany({
        where: { accountId, assortmentId: { in: assortmentIds }, ...(storeId ? { storeId } : {}) },
        select: {
          storeId: true,
          cellId: true,
          assortmentKind: true,
          assortmentId: true,
          qty: true,
          cell: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.stock.findMany({
        where: { accountId, assortmentId: { in: assortmentIds }, ...(storeId ? { storeId } : {}) },
        select: {
          storeId: true,
          assortmentKind: true,
          assortmentId: true,
          qty: true,
          store: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Reyestrdagi yacheykalar qoldiq jadvalida bo'lmasligi mumkin (bo'lak
    // kiritilgan, lekin qoldiq boshqa yerda) — nomi ko'rinishi uchun alohida.
    const knownCellIds = new Set(cellRows.map((r) => r.cellId));
    const extraCells = await this.prisma.client.stockPiece.findMany({
      where: { accountId, cellId: { not: null }, assortmentId: { in: assortmentIds } },
      select: { cell: { select: { id: true, name: true } } },
      distinct: ['cellId'],
    });

    const storeNames = new Map<string, string>();
    for (const r of cellRows) if (r.store) storeNames.set(r.store.id, r.store.name);
    for (const r of storeRows) if (r.store) storeNames.set(r.store.id, r.store.name);

    const cellNames = new Map<string, string>();
    for (const r of cellRows) cellNames.set(r.cell.id, r.cell.name);
    for (const r of extraCells) {
      if (r.cell && !knownCellIds.has(r.cell.id)) cellNames.set(r.cell.id, r.cell.name);
    }

    return [
      cellRows.map((r) => ({
        storeId: r.storeId,
        cellId: r.cellId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qty: r.qty.toString(),
      })),
      storeRows.map((r) => ({
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        qty: r.qty.toString(),
      })),
      [...storeNames].map(([id, name]) => ({ id, name })),
      [...cellNames].map(([id, name]) => ({ id, name })),
    ];
  }

  /**
   * Bayrog'i O'CHIQ, lekin reyestrda bo'lagi bor tovarlarning nomi —
   * ogohlantirish o'qiladigan bo'lishi uchun (`pieces-without-flag`).
   */
  private async loadUntrackedNames(
    accountId: string,
    trackedIds: string[],
    pieces: Array<{ assortmentId: string }>,
  ): Promise<
    Array<{
      id: string;
      name: string;
      code: string | null;
      uom: string | null;
      pieceTracked: false;
    }>
  > {
    const tracked = new Set(trackedIds);
    const missing = [...new Set(pieces.map((p) => p.assortmentId))].filter(
      (id) => !tracked.has(id),
    );
    if (missing.length === 0) return [];

    const rows = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: missing } },
      select: { id: true, name: true, code: true, uom: true },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      uom: p.uom,
      pieceTracked: false as const,
    }));
  }
}
