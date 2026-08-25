import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  TSD_PRODUCT_SELECT,
  classifyScanCode,
  normalizeScanCode,
  pickExactHits,
} from './tsd-scan.js';

export const TsdScanQuerySchema = z.object({
  code: z.string().min(1).max(200),
});

/** Bitta skan natijasidagi tovar — NARX MAYDONI YO'Q (`tsd-scan.ts` izohi). */
interface TsdProductHit {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  barcodes: string[];
  uom: string | null;
  archived: boolean;
  /** Tovarning «uy» yacheykasi (`attributes.__yacheyka`) — picking shundan yuradi. */
  homeCell: string | null;
  /** Butun tizim bo'yicha jami qoldiq (ombor kesimisiz — terminalga yetarli). */
  totalQty: string;
  /** Yacheyka kesimidagi haqiqiy qoldiq (`StockByCell`). */
  cells: Array<{
    storeId: string;
    storeName: string;
    cellId: string;
    cellName: string;
    qty: string;
  }>;
}

/**
 * TSD skan-qidiruvi (G-reja G5).
 *
 * Bu servis ATAYLAB `ProductService` ni chaqirmaydi: uning har bir o'quv yo'li
 * to'liq tovar qatorini (kirim narxi bilan) qaytaradi va bir kun kimdir u
 * yerga yangi maydon qo'shsa narx jimgina terminalga oqib chiqardi. Bu yerdagi
 * so'rov `select` bilan OQ RO'YXAT ustida ishlaydi.
 */
@Injectable()
export class TsdService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async scan(accountId: string, rawQuery: unknown) {
    const parsed = TsdScanQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException('Skan kodi kiritilmadi');
    const code = normalizeScanCode(parsed.data.code);
    const kind = classifyScanCode(code);

    // K-reja 7.3 — bo'lak kodi tovar qidiruviga TUSHMAYDI (izoh `tsd-scan.ts`).
    if (kind === 'piece') {
      return { code, kind: 'piece' as const, piece: { code, supported: false }, products: [] };
    }

    // Yacheyka kodi — terminal `/admin/stores/cells/by-barcode` ga o'tadi
    // (allowlist'da bor, narxsiz). Bu yerda tovar qidirilmaydi: yacheyka
    // kodi tovar shtrixi bo'lib qolishi mumkin emas.
    if (kind === 'cell') {
      return { code, kind: 'cell' as const, products: [] };
    }

    const rows = await this.prisma.client.product.findMany({
      where: {
        accountId,
        deletedAt: null,
        OR: [{ barcodes: { has: code } }, { code }, { article: code }],
      },
      select: TSD_PRODUCT_SELECT,
      take: 20,
    });
    if (rows.length === 0) return { code, kind: 'none' as const, products: [] };

    // Multi-hit qoidasi — G-reja majburiy bandi (`pickExactHits` izohi).
    const winners = pickExactHits(
      rows.map((r) => ({ ...r, barcodes: r.barcodes ?? [] })),
      code,
    );
    const ids = winners.map((w) => w.id);

    const [stocks, cellRows] = await Promise.all([
      this.prisma.client.stock.findMany({
        where: { accountId, assortmentKind: 'product', assortmentId: { in: ids } },
        select: { assortmentId: true, qty: true },
      }),
      this.prisma.client.stockByCell.findMany({
        where: { accountId, assortmentKind: 'product', assortmentId: { in: ids } },
        select: {
          assortmentId: true,
          storeId: true,
          cellId: true,
          qty: true,
          store: { select: { name: true } },
          cell: { select: { name: true } },
        },
      }),
    ]);

    const products: TsdProductHit[] = winners.map((w) => {
      const total = stocks
        .filter((s) => s.assortmentId === w.id)
        .reduce((sum, s) => sum + Number(s.qty), 0);
      const attrs = (w.attributes ?? {}) as Record<string, unknown>;
      const home = typeof attrs.__yacheyka === 'string' ? attrs.__yacheyka : null;
      return {
        id: w.id,
        name: w.name,
        code: w.code,
        article: w.article,
        barcodes: w.barcodes,
        uom: w.uom,
        archived: w.archived,
        homeCell: home,
        totalQty: String(total),
        cells: cellRows
          .filter((c) => c.assortmentId === w.id)
          .map((c) => ({
            storeId: c.storeId,
            storeName: c.store?.name ?? '',
            cellId: c.cellId,
            cellName: c.cell?.name ?? '',
            qty: c.qty.toString(),
          })),
      };
    });

    return { code, kind: 'product' as const, products };
  }
}
