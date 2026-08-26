import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { compareDecimals } from '../shared/decimal.js';
import { PIECE_STATUS, isPieceLabel } from './stock-piece-core.js';
import {
  MAX_CREATE_COUNT,
  MAX_LABEL_RETRIES,
  type RegistryView,
  buildRegistryView,
  nextPieceSeq,
  parseLengthInput,
  planPieceCreation,
} from './stock-piece-registry-core.js';

/**
 * K2 — bo'lak reyestrini BOSHQARISH (katta omborchi ekrani).
 *
 * 🔴 **Bu servis `Stock`/`StockByCell` ga BIR QATOR HAM yozmaydi.** U faqat
 * `stock_pieces` bilan ishlaydi va `Product.pieceTracked` bayrog'ini
 * o'zgartiradi. Sabab K-rejaning 10-bo'lim 5-bandi: eng yomon holatda reyestr
 * noto'g'ri bo'ladi, kassa esa avvalgidek ishlayveradi. 2026-08-24 da savdo
 * aynan qoldiq mexanizmiga tegilgani uchun 46 daqiqa to'xtagan edi.
 *
 * Shundan kelib chiqadigan ONGLI xulq: bo'lak «tugadi» deb yopilsa reyestr
 * kamayadi, qoldiq esa o'sha joyida qoladi ⇒ sverka DARHOL farq ko'rsatadi.
 * Bu nuqson emas — K2/4-vazifaning o'zi. Qoldiqni tuzatish inventarizatsiya
 * yoki hisobdan chiqarish ishi (K4/K5), bu ekranning ishi emas.
 */

const uuid = z.string().uuid();

/** Doira: ombor × tovar (yacheyka ixtiyoriy). Ikkalasi ham MAJBURIY — bu ekran
 *  ro'yxat emas, bitta tovar bilan ishlaydigan ish o'rni. */
export const RegistryScopeSchema = z.object({
  storeId: uuid,
  assortmentId: uuid,
});
export type RegistryScope = z.infer<typeof RegistryScopeSchema>;

export const CreatePiecesSchema = z.object({
  storeId: uuid,
  assortmentId: uuid,
  /** NULL/bo'sh = ombordagi yacheykasiz hovuz (jonlida qoldiqning ~94 % i). */
  cellId: uuid.nullish(),
  /** Butun rulonmi (yorliqsiz, almashtiriladigan) — K-Q3. */
  whole: z.boolean().default(false),
  /** Omborchi kiritgani: «250», «250,5». */
  length: z.string().min(1).max(32),
  /** «250 m × 3» — bir bosishda nechta bir xil qator. */
  count: z.coerce.number().int().min(1).max(MAX_CREATE_COUNT).default(1),
});

export const UpdatePieceSchema = z
  .object({
    /** Yangi (tuzatilgan) uzunlik. */
    length: z.string().min(1).max(32).optional(),
    /** Ko'chirish: yangi yacheyka yoki `null` — yacheykasiz hovuzga. */
    cellId: uuid.nullable().optional(),
  })
  .refine((d) => d.length !== undefined || d.cellId !== undefined, {
    message: "O'zgartirish uchun `length` yoki `cellId` berilishi kerak",
  });

export const SetPieceFlagSchema = z.object({
  assortmentId: uuid,
  pieceTracked: z.boolean(),
});

export const LookupSchema = z.object({ code: z.string().min(1).max(64) });

export interface RegistryResponse {
  product: {
    id: string;
    name: string;
    code: string | null;
    uom: string | null;
    pieceTracked: boolean;
  };
  store: { id: string; name: string };
  view: RegistryView;
  /** Doiradagi yacheykalar (ko'chirish tanlovi uchun). */
  cells: Array<{ id: string; name: string }>;
}

@Injectable()
export class StockPieceRegistryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // O'qish
  // -------------------------------------------------------------------------

  async list(accountId: string, raw: unknown): Promise<RegistryResponse> {
    const scope = this.parse(RegistryScopeSchema, raw);
    return this.buildResponse(accountId, scope.storeId, scope.assortmentId);
  }

  /**
   * Yorliq bo'yicha bo'lakni topish — 7.3 ning HAQIQIY sinovi.
   *
   * Omborchi `BLK-000041` ni skanerlaganda AYNAN bitta bo'lak ochilishi kerak,
   * tovar multi-hit tanlovi EMAS. Shuning uchun bu yo'l `BLK-` makonidan
   * tashqaridagi kodni umuman qidirmaydi va massiv emas, BITTA obyekt
   * qaytaradi.
   */
  async lookup(accountId: string, raw: unknown) {
    const { code } = this.parse(LookupSchema, raw);
    const label = code.trim().toUpperCase();
    if (!isPieceLabel(label)) {
      throw new BadRequestException(`Bu bo'lak yorlig'i emas: ${code}`);
    }
    const piece = await this.prisma.client.stockPiece.findFirst({
      where: { accountId, label },
      select: {
        id: true,
        storeId: true,
        cellId: true,
        assortmentKind: true,
        assortmentId: true,
        length: true,
        whole: true,
        label: true,
        status: true,
        store: { select: { id: true, name: true } },
        cell: { select: { id: true, name: true } },
      },
    });
    if (!piece) throw new NotFoundException(`Bo'lak topilmadi: ${label}`);

    const product = await this.prisma.client.product.findFirst({
      where: { accountId, id: piece.assortmentId },
      select: { id: true, name: true, code: true, uom: true, pieceTracked: true },
    });

    return {
      piece: {
        id: piece.id,
        label: piece.label,
        length: piece.length.toString(),
        whole: piece.whole,
        status: piece.status,
        storeId: piece.storeId,
        storeName: piece.store?.name ?? null,
        cellId: piece.cellId,
        cellName: piece.cell?.name ?? null,
        assortmentKind: piece.assortmentKind,
        assortmentId: piece.assortmentId,
      },
      product,
    };
  }

  // -------------------------------------------------------------------------
  // Yozish
  // -------------------------------------------------------------------------

  /**
   * Bo'lak(lar) qo'shish. Butun rulon uchun `whole=true, count=N` — «250 m × 3»
   * bitta bosishda 3 ta YORLIQSIZ qator ochadi (K2/2-vazifa).
   *
   * Yorliq raqami poygasi: bir vaqtda ikki omborchi bossa ikkalasi ham bir xil
   * `seq` ni oladi — birinchisi yozadi, ikkinchisi `P2002` oladi va keyingi
   * raqamdan qayta urinadi. DB unikal indeksi (K1) oxirgi to'siq.
   */
  async create(accountId: string, raw: unknown): Promise<RegistryResponse & { labels: string[] }> {
    const input = this.parse(CreatePiecesSchema, raw);
    const length = this.parseLength(input.length);

    await this.assertScope(accountId, input.storeId, input.assortmentId, input.cellId ?? null);

    let labels: string[] = [];
    for (let attempt = 0; ; attempt++) {
      const startSeq = input.whole ? 1 : await this.nextSeq(accountId);
      const plan = planPieceCreation({
        length,
        whole: input.whole,
        count: input.count,
        startSeq,
      });
      if (plan.error) throw new BadRequestException(this.createErrorMessage(plan.error));
      if (plan.violations) {
        throw new BadRequestException(`Bo'lak qoidasi buzildi: ${plan.violations.join(', ')}`);
      }
      const drafts = plan.drafts ?? [];

      try {
        await this.prisma.client.stockPiece.createMany({
          data: drafts.map((d) => ({
            accountId,
            storeId: input.storeId,
            cellId: input.cellId ?? null,
            assortmentKind: 'product',
            assortmentId: input.assortmentId,
            length: d.length,
            whole: d.whole,
            label: d.label,
            status: d.status,
          })),
        });
      } catch (e) {
        // Yorliq poygasi: qo'shni sessiya o'sha raqamni oldi — keyingisidan
        // qayta urinamiz. Boshqa har qanday xato yuqoriga ketadi.
        if ((e as { code?: string }).code === 'P2002' && attempt + 1 < MAX_LABEL_RETRIES) continue;
        throw e;
      }

      labels = drafts.map((d) => d.label).filter((l): l is string => l !== null);
      break;
    }

    const response = await this.buildResponse(accountId, input.storeId, input.assortmentId);
    return { ...response, labels };
  }

  /** Uzunlikni tuzatish va/yoki boshqa yacheykaga ko'chirish (K2/1-vazifa). */
  async update(accountId: string, id: string, raw: unknown): Promise<RegistryResponse> {
    const input = this.parse(UpdatePieceSchema, raw);
    const piece = await this.loadPiece(accountId, id);

    const data: { length?: string; cellId?: string | null } = {};
    if (input.length !== undefined) {
      const length = this.parseLength(input.length);
      // Faol bo'lak nol/manfiy bo'lolmaydi (K1 CHECK bilan bir qoida), chiqindi
      // chegarasi esa ATAYLAB qo'llanmaydi: 0,4 m qolgani ANIQLANSA omborchi
      // uni yozib, so'ng «tugadi» bilan yopadi — kiritishda taqiq bor, xolos.
      if (piece.status === PIECE_STATUS.active && compareDecimals(length, '0') <= 0) {
        throw new BadRequestException("Faol bo'lakning uzunligi noldan katta bo'lishi kerak");
      }
      data.length = length;
    }
    if (input.cellId !== undefined) {
      await this.assertCell(accountId, piece.storeId, input.cellId);
      data.cellId = input.cellId;
    }

    await this.prisma.client.stockPiece.update({ where: { id: piece.id }, data });
    return this.buildResponse(accountId, piece.storeId, piece.assortmentId);
  }

  /**
   * «Tugadi» — bo'lak reyestrdan chiqadi (`consumed`).
   *
   * Qoldiqqa TEGILMAYDI (yuqoridagi izoh). Reyestr kamayadi ⇒ sverka farq
   * ko'rsatadi va bu ekranda darhol ko'rinadi. Aynan shu ko'rinish katta
   * omborchiga «endi qoldiqni ham tuzatish kerak» deb aytadi.
   */
  async close(accountId: string, id: string): Promise<RegistryResponse> {
    const piece = await this.loadPiece(accountId, id);
    if (piece.status !== PIECE_STATUS.active) {
      throw new BadRequestException("Bo'lak allaqachon yopilgan");
    }
    await this.prisma.client.stockPiece.update({
      where: { id: piece.id },
      data: { status: PIECE_STATUS.consumed, consumedAt: new Date() },
    });
    return this.buildResponse(accountId, piece.storeId, piece.assortmentId);
  }

  /**
   * «Bo'lak hisobi yuritilsin» bayrog'i (K-Q9).
   *
   * ⚠️ K2 doirasidan ONGLI CHETLASHISH, hisobotda yozilgan: bayroqning TO'LIQ
   * siyosati (tovar kartochkasidagi joyi, «m» birligidagi yangi tovarda
   * yoqilgan kelishi, «hal qilinmagan» ro'yxati) — K6. Bu yerda faqat shu
   * ekrandagi tugma bor, chunki bayroqsiz sverka tovarni UMUMAN ko'rmaydi
   * (`buildPieceReconciliation` mezoni) va K2 ning qabul mezonini — «reyestr
   * `StockByCell.qty` bilan mos kelgani KO'RSATILGAN» — bajarib bo'lmasdi.
   * Ruxsat `piecetracking.update` (K-Q9: katta omborchi + egasi/menejer).
   */
  async setFlag(accountId: string, raw: unknown): Promise<{ id: string; pieceTracked: boolean }> {
    const input = this.parse(SetPieceFlagSchema, raw);
    const product = await this.prisma.client.product.findFirst({
      where: { accountId, id: input.assortmentId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const updated = await this.prisma.client.product.update({
      where: { id: product.id },
      data: { pieceTracked: input.pieceTracked },
      select: { id: true, pieceTracked: true },
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Ichki
  // -------------------------------------------------------------------------

  private parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(', '));
    }
    return parsed.data;
  }

  private parseLength(raw: string): string {
    const { value, error } = parseLengthInput(raw);
    if (value === undefined) {
      throw new BadRequestException(`Uzunlik noto'g'ri: ${error ?? 'not-a-number'}`);
    }
    return value;
  }

  private createErrorMessage(error: string): string {
    if (error === 'scrap-length') {
      return '1 m dan kalta qoldiq CHIQINDI — reyestrga kiritilmaydi (K-Q6)';
    }
    if (error === 'length-not-positive') return "Uzunlik noldan katta bo'lishi kerak";
    return `Qator soni 1..${MAX_CREATE_COUNT} oralig'ida bo'lishi kerak`;
  }

  /** Akkauntdagi eng katta yorliq → keyingi tartib raqami. */
  private async nextSeq(accountId: string): Promise<number> {
    const last = await this.prisma.client.stockPiece.findFirst({
      where: { accountId, label: { not: null } },
      orderBy: { label: 'desc' },
      select: { label: true },
    });
    return nextPieceSeq(last?.label ?? null);
  }

  private async loadPiece(accountId: string, id: string) {
    const parsed = uuid.safeParse(id);
    if (!parsed.success) throw new BadRequestException("Bo'lak identifikatori noto'g'ri");
    const piece = await this.prisma.client.stockPiece.findFirst({
      where: { id, accountId },
      select: { id: true, storeId: true, assortmentId: true, status: true, cellId: true },
    });
    if (!piece) throw new NotFoundException("Bo'lak topilmadi");
    return piece;
  }

  private async assertScope(
    accountId: string,
    storeId: string,
    assortmentId: string,
    cellId: string | null,
  ): Promise<void> {
    const [store, product] = await Promise.all([
      this.prisma.client.store.findFirst({
        where: { id: storeId, accountId },
        select: { id: true },
      }),
      this.prisma.client.product.findFirst({
        where: { id: assortmentId, accountId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!store) throw new NotFoundException('Ombor topilmadi');
    if (!product) throw new NotFoundException('Tovar topilmadi');
    await this.assertCell(accountId, storeId, cellId);
  }

  /** Yacheyka SHU omborniki ekanini tekshiradi — aks holda bo'lak boshqa
   *  ombordagi joyga «yopishib» qolardi va sverka abadiy farq berardi. */
  private async assertCell(
    accountId: string,
    storeId: string,
    cellId: string | null | undefined,
  ): Promise<void> {
    if (!cellId) return;
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, accountId, storeId },
      select: { id: true },
    });
    if (!cell) throw new NotFoundException('Yacheyka bu omborda topilmadi');
  }

  private async buildResponse(
    accountId: string,
    storeId: string,
    assortmentId: string,
  ): Promise<RegistryResponse> {
    const [store, product] = await Promise.all([
      this.prisma.client.store.findFirst({
        where: { id: storeId, accountId },
        select: { id: true, name: true },
      }),
      this.prisma.client.product.findFirst({
        where: { id: assortmentId, accountId, deletedAt: null },
        select: { id: true, name: true, code: true, uom: true, pieceTracked: true },
      }),
    ]);
    if (!store) throw new NotFoundException('Ombor topilmadi');
    if (!product) throw new NotFoundException('Tovar topilmadi');

    const [pieces, cellStock, storeStock, cells] = await Promise.all([
      this.prisma.client.stockPiece.findMany({
        where: { accountId, storeId, assortmentId, status: PIECE_STATUS.active },
        select: {
          id: true,
          cellId: true,
          length: true,
          whole: true,
          label: true,
          status: true,
          sourcePieceId: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.stockByCell.findMany({
        where: { accountId, storeId, assortmentId },
        select: { cellId: true, qty: true, cell: { select: { id: true, name: true } } },
      }),
      this.prisma.client.stock.findFirst({
        where: { accountId, storeId, assortmentId },
        select: { qty: true },
      }),
      this.prisma.client.storeCell.findMany({
        where: { accountId, storeId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    ]);

    const view = buildRegistryView({
      pieces: pieces.map((p) => ({
        id: p.id,
        cellId: p.cellId,
        length: p.length.toString(),
        whole: p.whole,
        label: p.label,
        status: p.status,
        sourcePieceId: p.sourcePieceId,
        updatedAt: p.updatedAt.toISOString(),
      })),
      cellStock: cellStock.map((c) => ({ cellId: c.cellId, qty: c.qty.toString() })),
      storeQty: storeStock?.qty.toString() ?? '0',
      cells,
    });

    return { product, store, view, cells };
  }
}
