import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { readBrakStore } from '../sales-return/sales-return-acceptance.js';
import {
  type OfferPiece,
  type PieceComposition,
  type PieceOffer,
  buildPieceComposition,
  planPieceOffer,
} from './piece-offer-core.js';
import { PIECE_STATUS } from './stock-piece-core.js';

/**
 * K3 — KASSIR ko'rinishi. FAQAT O'QIYDI.
 *
 * Bu servis birorta `create/update/delete` chaqirmaydi (K1 sverkasi bilan bir
 * intizom): uning ishi kassirga bo'laklarni KO'RSATISH. Qoldiqqa ham,
 * reyestrga ham tegmaydi ⇒ eng yomon holatda ekranda eskirgan tarkib
 * ko'rinadi, kassa esa avvalgidek ishlayveradi.
 *
 * Ruxsat — `product.view` (kontroller). Sabab: bu tovar kartochkasining
 * ko'rinishi, reyestr BOSHQARUVI emas; `piecetracking` esa YOZUV huquqi
 * (K-Q9: katta omborchi). Kassirda `product.view` allaqachon bor
 * (`role-templates.ts` → `cashier`), ya'ni yangi ruxsat-entity KERAK EMAS va
 * `topup-role-permissions.ts` ga K3 hech narsa qo'shmaydi.
 *
 * 🔴 **BRAK ombori ISTISNO** (G3 `__brakStore`, G4 E4 bilan bir qoida):
 * brak tovar mijozga sotilmaydi, ya'ni uning bo'laklari kassir ekranida
 * «bor» bo'lib ko'rinmasligi kerak — aks holda kassir mijozga yo'q narsani
 * va'da qilardi.
 */

export const PieceAvailabilityQuerySchema = z.object({
  assortmentId: z.string().uuid(),
  /** Bitta ombor kesimi. Bo'sh = HAMMA ombor (K-Q5: kassir hammasini ko'radi). */
  storeId: z.string().uuid().optional(),
  /** Kassir so'ragan miqdor — taklif shundan hisoblanadi. */
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a non-negative decimal')
    .optional(),
});
export type PieceAvailabilityQuery = z.infer<typeof PieceAvailabilityQuerySchema>;

export interface PieceAvailabilityStore {
  storeId: string;
  storeName: string;
  composition: PieceComposition;
}

export interface PieceAvailabilityResponse {
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    pieceTracked: boolean;
  };
  /** Ombor kesimidagi tarkib (kassir bo'lak qayerda turganini ko'rsin). */
  stores: PieceAvailabilityStore[];
  /** Doiradagi UMUMIY tarkib — ekranning asosiy qatori. */
  composition: PieceComposition;
  offer: PieceOffer;
}

@Injectable()
export class StockPieceAvailabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async availability(accountId: string, raw: unknown): Promise<PieceAvailabilityResponse> {
    const parsed = PieceAvailabilityQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const query = parsed.data;

    const product = await this.prisma.client.product.findFirst({
      where: { accountId, id: query.assortmentId, deletedAt: null },
      select: { id: true, name: true, code: true, uom: true, pieceTracked: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    // Bayrog'i O'CHIQ tovarda reyestr o'qilmaydi ham: K3 ning qabul mezoni —
    // «bayroq O'CHIQ tovarlarda kassa ekrani MUTLAQO o'zgarmagan». Bo'sh javob
    // ekranga hech narsa qo'shmaydi.
    if (!product.pieceTracked) {
      const empty = buildPieceComposition([]);
      return {
        product,
        stores: [],
        composition: empty,
        offer: planPieceOffer({ pieces: [], requested: query.quantity ?? '0' }),
      };
    }

    const rows = await this.prisma.client.stockPiece.findMany({
      where: {
        accountId,
        assortmentId: query.assortmentId,
        status: PIECE_STATUS.active,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      select: {
        id: true,
        storeId: true,
        cellId: true,
        length: true,
        whole: true,
        label: true,
        status: true,
        store: { select: { id: true, name: true, attributes: true } },
        cell: { select: { name: true } },
      },
    });

    const storeNames = new Map<string, string>();
    const pieces: OfferPiece[] = [];
    for (const r of rows) {
      // E4 — BRAK ombori manba EMAS (fayl boshidagi izoh).
      if (readBrakStore(r.store?.attributes)) continue;
      storeNames.set(r.storeId, r.store?.name ?? r.storeId);
      pieces.push({
        id: r.id,
        storeId: r.storeId,
        cellId: r.cellId,
        cellName: r.cell?.name ?? null,
        length: r.length.toString(),
        whole: r.whole,
        label: r.label,
        status: r.status,
      });
    }

    const stores: PieceAvailabilityStore[] = [...storeNames]
      .map(([storeId, storeName]) => ({
        storeId,
        storeName,
        composition: buildPieceComposition(pieces.filter((p) => p.storeId === storeId)),
      }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName));

    return {
      product,
      stores,
      composition: buildPieceComposition(pieces),
      offer: planPieceOffer({ pieces, requested: query.quantity ?? '0' }),
    };
  }
}
