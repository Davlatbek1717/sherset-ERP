import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type PendingDecisionList,
  buildPendingDecisionList,
  isMeterUom,
} from './piece-flag-policy.js';
import { PIECE_STATUS } from './stock-piece-core.js';

export const PendingDecisionFilterSchema = z.object({
  /** Qator chegarasi. Kesilgani javobda `truncated` bo'lib qaytadi. */
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  /** Nom/kod bo'yicha qidiruv. */
  search: z.string().trim().max(120).optional(),
});

/**
 * Bir yugurishda o'qiladigan «qaror qilinmagan» tovarlar chegarasi.
 *
 * Jonli katalog — 5086 tovar (K1 lokal o'lchovi) va deploy kuni HAMMASI
 * qaror qilinmagan bo'ladi, ya'ni birinchi ochilishda taxminan shuncha
 * yengil qator o'qiladi. Chegara portlashdan himoya, TANLOV emas: unga
 * yetilsa javobda `scanTruncated` bayrog'i qaytadi va ekran shuni aytadi —
 * jim kesish YO'Q (IS-5 intizomi).
 */
const SCAN_LIMIT = 20_000;

export interface PendingDecisionResponse extends PendingDecisionList {
  /** Katalog skani chegaraga urildi — ro'yxat TO'LIQ emas. */
  scanTruncated: boolean;
}

/**
 * K6/3 — «HAL QILINMAGAN» ro'yxati.
 *
 * FAQAT O'QIYDI (K1 sverkasi va `warehouse-state.ts` bilan bir intizom):
 * birorta `create/update/delete` chaqirmaydi. Qarorni yozadigan yagona yo'l —
 * `StockPieceRegistryService.setFlag` (`POST /stock-pieces/flag`), ya'ni
 * muhr ham, ruxsat ham BITTA joyda.
 *
 * Ro'yxatga tushish mezoni IKKI shoxli:
 *
 *   (a) **birligi «m»** (K6/3 ning matni) — bo'lak hisobi kerak bo'lishi
 *       mumkin bo'lgan nomenklatura;
 *   (b) **reyestrda FAOL bo'lagi bor** — birligi boshqacha yozilgan bo'lsa
 *       ham kimdir bo'lak kiritgan. Bu shox K1 sverkasidagi
 *       `pieces-without-flag` ogohlantirishining JUFTI: u yerda «bayroq
 *       o'chiq, bo'lak bor» deb qichqiriladi, bu yerda esa o'sha tovar
 *       QAROR uchun ro'yxatga chiqadi. Busiz ogohlantirishni yopadigan
 *       tugma hech qayerda bo'lmasdi.
 *
 * Ikkala shox ham `piece_tracked_decided_at IS NULL` sharti bilan kesiladi:
 * qaror qilingan tovar ro'yxatdan CHIQADI (K6/3: «Ha yoki yo'q deyilgach
 * ro'yxatdan chiqadi»).
 *
 * 🔴 **Birlik mezoni SQL da EMAS, `isMeterUom` da.** `Product.uom` — erkin
 * matn («м», «M», «Metr»), ya'ni SQL tomonida u registr-sezgir `IN` bilan
 * tekshirilsa bir qism tovar JIMGINA ro'yxatga tushmasdi va aynan
 * unutilishi kerak bo'lmagan nomenklatura yo'qolardi. Shuning uchun baza
 * faqat «qaror qilinmagan» kesimini beradi, birlik qoidasi esa sof yadroda
 * (testlar bilan qulflangan).
 */
@Injectable()
export class StockPieceDecisionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async pending(accountId: string, raw: unknown): Promise<PendingDecisionResponse> {
    const parsed = PendingDecisionFilterSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { limit, search } = parsed.data;

    // (b) shoxi: reyestrda FAOL bo'lagi bor tovarlar.
    const withPieces = await this.prisma.client.stockPiece.groupBy({
      by: ['assortmentId'],
      where: { accountId, status: PIECE_STATUS.active, assortmentKind: 'product' },
      _count: { _all: true },
    });
    const pieceCount = new Map(withPieces.map((r) => [r.assortmentId, r._count._all]));

    const products = await this.prisma.client.product.findMany({
      where: { accountId, deletedAt: null, pieceTrackedDecidedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        uom: true,
        pieceTracked: true,
        pieceTrackedDecidedAt: true,
      },
      orderBy: { name: 'asc' },
      take: SCAN_LIMIT,
    });

    const needle = search?.toLowerCase() ?? '';
    const candidates = products
      .filter((p) => isMeterUom(p.uom) || pieceCount.has(p.id))
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          (p.code ?? '').toLowerCase().includes(needle),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        uom: p.uom,
        pieceTracked: p.pieceTracked,
        decidedAt: p.pieceTrackedDecidedAt,
        activePieces: pieceCount.get(p.id) ?? 0,
      }));

    return {
      ...buildPendingDecisionList(candidates, limit),
      scanTruncated: products.length >= SCAN_LIMIT,
    };
  }
}
