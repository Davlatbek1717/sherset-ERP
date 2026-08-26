import type { Prisma } from '@moysklad/db';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CutChild,
  type CutRule,
  PIECE_CONSUMED_REASON,
  cutErrorMessage,
  planCut,
  planSaleConsumption,
} from './piece-cut-core.js';
import { PIECE_STATUS, isPieceLabel } from './stock-piece-core.js';
import { nextPieceSeq } from './stock-piece-registry-core.js';

/**
 * K4 — bo'lak KESIMI va uning chek bilan bog'lanishi.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K4 fazasi.
 *
 * 🔴 **Bu servis ham `Stock`/`StockByCell` ga BIR QATOR HAM yozmaydi** — K1,
 * K2, K3 dagi bilan AYNI intizom. Kesim STOK-NEYTRAL (K-reja 2-bo'lim):
 * 250 → 180 + 70, jami o'sha 250. Qoldiq faqat `post()` da kamayadi va uni
 * `stock.service` o'z yo'li bilan qiladi — bu yerdagi yagona ish
 * `stock_pieces` qatorlarini haqiqatga moslashtirish.
 *
 * Chiqindi (1 m dan kalta) va omborchi tuzatgan kesim yo'qotishi ham FAQAT
 * reyestrdan chiqadi (egasining 2026-08-25 qarori) — qoldiq o'z holicha
 * qoladi va sverka farqni ko'rsatadi (tuzatish K5 da, inventarizatsiya bilan).
 *
 * Nega ALOHIDA servis, `RestockTaskService` ichida emas: `stock_pieces` ga
 * yozadigan hamma yo'l BITTA modulda tursin (K2 ning `StockPieceRegistryService`
 * bilan bir joyda) — aks holda «kim bo'lakka yozadi» savoliga javob repo
 * bo'ylab sochilib ketardi. Yig'ish oqimi (`restock-task`) va kassa
 * (`retail-sale`) shu servisni CHAQIRADI, o'zi jadvalga tegmaydi.
 */
@Injectable()
export class StockPieceCutService {
  // -------------------------------------------------------------------------
  // Yorliq ketma-ketligi
  // -------------------------------------------------------------------------

  /**
   * Akkauntdagi eng katta yorliqdan keyingi tartib raqami.
   *
   * K2 dagi `nextSeq` bilan AYNI qoida (`label DESC` bo'yicha bitta qator) —
   * takrorlanish emas, chunki bu yerda so'rov TRANZAKSIYA ichida ketadi va
   * poyga `P2002` bilan yuqorida qayta uriniladi (chaqiruvchi qarori).
   */
  async nextSeq(tx: Prisma.TransactionClient, accountId: string): Promise<number> {
    const last = await tx.stockPiece.findFirst({
      where: { accountId, label: { not: null } },
      orderBy: { label: 'desc' },
      select: { label: true },
    });
    return nextPieceSeq(last?.label ?? null);
  }

  // -------------------------------------------------------------------------
  // Kesim
  // -------------------------------------------------------------------------

  /**
   * Manba bo'lakni topadi: `pieceId` yoki SKANERLANGAN `BLK-` yorlig'i.
   *
   * Yorliq yo'li 7.3 ning haqiqiy sinovi: `BLK-` makonidan tashqaridagi kod
   * umuman qidirilmaydi, ya'ni omborchi tovar shtrixini skanerlab qo'ysa
   * «bu bo'lak yorlig'i emas» degan ANIQ xato oladi — jimgina noto'g'ri
   * bo'lak ochilmaydi.
   */
  async findSource(
    tx: Prisma.TransactionClient,
    accountId: string,
    ref: { pieceId?: string | null; label?: string | null },
  ) {
    const where = ref.pieceId
      ? { id: ref.pieceId, accountId }
      : (() => {
          const label = (ref.label ?? '').trim().toUpperCase();
          if (!isPieceLabel(label)) {
            throw new BadRequestException(`Bu bo'lak yorlig'i emas: ${ref.label ?? ''}`);
          }
          return { accountId, label };
        })();

    const piece = await tx.stockPiece.findFirst({
      where,
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
        reservedPositionId: true,
      },
    });
    if (!piece) throw new NotFoundException("Bo'lak topilmadi");
    return piece;
  }

  /**
   * KESIM — K4 ning o'zagi.
   *
   * Manba `consumed` bo'ladi (tarix uchun qoladi, `sourcePieceId` zanjiri
   * uzilmasin — K2 ning `close` qaroridagi bilan bir sabab), o'rniga uch xil
   * bola paydo bo'ladi:
   *   · mijozga ketadigan bo'lak — YORLIQLI, chek qatoriga BIRIKTIRILGAN;
   *   · omborda qoladigan qoldiq — YANGI YORLIQLI (eski yorliqda eski uzunlik
   *     yozilgan, odam esa tizimga emas yorliqqa ishonadi);
   *   · chiqindi (< 1 m) va kesim yo'qotishi — `consumed`, sababi bilan.
   *
   * `take-whole` hukmida hech narsa kesilmaydi: manbaning O'ZI qatorga
   * biriktiriladi (yangi yorliq ham, yangi qator ham kerak emas).
   *
   * Tranzaksiyani CHAQIRUVCHI ochadi — kesim topshiriq qatorini yopish bilan
   * bitta tranzaksiyada bo'lishi shart (aks holda kesim yozilib qator ochiq
   * qolardi yoki teskarisi).
   */
  async cut(
    tx: Prisma.TransactionClient,
    input: {
      accountId: string;
      source: Awaited<ReturnType<StockPieceCutService['findSource']>>;
      cutLength: string;
      remainingLength?: string | null;
      saleId: string;
      positionId: string;
      startSeq: number;
    },
  ): Promise<{ rule: CutRule; labels: string[]; customerPieceId: string }> {
    const { accountId, source, saleId, positionId } = input;

    const plan = planCut({
      source: {
        length: source.length.toString(),
        whole: source.whole,
        status: source.status,
        label: source.label,
      },
      cutLength: input.cutLength,
      remainingLength: input.remainingLength ?? null,
      startSeq: input.startSeq,
    });
    if (plan.error) throw new BadRequestException(cutErrorMessage(plan.error));

    // ── Mijoz butun bo'lakni oladi: kesim YO'Q ────────────────────────────
    if (plan.rule === 'take-whole') {
      await tx.stockPiece.update({
        where: { id: source.id },
        data: { reservedSaleId: saleId, reservedPositionId: positionId },
      });
      return { rule: 'take-whole', labels: [], customerPieceId: source.id };
    }

    // ── Kesim ─────────────────────────────────────────────────────────────
    const base = {
      accountId,
      storeId: source.storeId,
      cellId: source.cellId,
      assortmentKind: source.assortmentKind,
      assortmentId: source.assortmentId,
      sourcePieceId: source.id,
    };
    const now = new Date();
    const row = (child: CutChild, reserved: boolean) => ({
      ...base,
      length: child.length,
      whole: child.whole,
      label: child.label,
      status: child.status,
      consumedReason: child.reason,
      consumedAt: child.status === PIECE_STATUS.consumed ? now : null,
      reservedSaleId: reserved ? saleId : null,
      reservedPositionId: reserved ? positionId : null,
    });

    // Mijoz bo'lagi ALOHIDA yoziladi: uning `id` si kerak (qator yopilishi
    // shu bo'lak bo'yicha hisoblanadi va TSD yorliqni qayta bosa oladi).
    // biome-ignore lint/style/noNonNullAssertion: `rule === 'cut'` da doim bor
    const customer = await tx.stockPiece.create({ data: row(plan.customer!, true) });

    const rest = [plan.remainder, plan.scrap, plan.loss].filter((c): c is CutChild => c != null);
    if (rest.length > 0) {
      await tx.stockPiece.createMany({ data: rest.map((c) => row(c, false)) });
    }

    // Manba reyestrdan chiqadi — endi u jismonan mavjud emas (bolalarga
    // bo'lindi). `consumed` sababi ATAYLAB yo'q: manba yo'qolmadi, SHAKLINI
    // o'zgartirdi va zanjir `sourcePieceId` orqali ko'rinib turadi.
    await tx.stockPiece.update({
      where: { id: source.id },
      data: {
        status: PIECE_STATUS.consumed,
        consumedAt: now,
        reservedSaleId: null,
        reservedPositionId: null,
      },
    });

    return { rule: 'cut', labels: plan.labels ?? [], customerPieceId: customer.id };
  }

  /** Qatorga biriktirilgan bo'laklarni bekor qilish (kesimni qayta yozish). */
  async releasePosition(
    tx: Prisma.TransactionClient,
    accountId: string,
    positionId: string,
  ): Promise<number> {
    const res = await tx.stockPiece.updateMany({
      where: { accountId, reservedPositionId: positionId, status: PIECE_STATUS.active },
      data: { reservedSaleId: null, reservedPositionId: null },
    });
    return res.count;
  }

  // -------------------------------------------------------------------------
  // Chek hayotiy sikli
  // -------------------------------------------------------------------------

  /** `consumePiecesForSale` ning servis ko'rinishi (pastdagi izohga qarang). */
  consumeForSale = consumePiecesForSale;

  /** `releasePiecesForSale` ning servis ko'rinishi. */
  releaseSale = releasePiecesForSale;
}

// ---------------------------------------------------------------------------
// Chek hayotiy sikli — SOF FUNKSIYALAR
// ---------------------------------------------------------------------------
//
// Nega servis METODI emas, funksiya: ularni `RetailSaleService` chaqiradi va
// uni Nest DI orqali bog'lash konstruktorga 8-parametr qo'shishni talab
// qilardi — bu esa 27 ta mavjud test faylini MAZMUNSIZ o'zgartirardi
// (har biri servisni qo'lda quradi). Funksiya `tx` ni argument sifatida
// oladi, ya'ni holati yo'q va DI ham kerak emas. Modul chegarasi buzilmaydi:
// `stock_pieces` ga yozadigan kod HAMON shu faylda.

/**
 * `post()` — mijozga ketgan bo'laklar reyestrdan chiqadi.
 *
 * Qoldiq ayirish TRANZAKSIYASI ICHIDA chaqiriladi (K4/6-vazifa): qoldiq
 * kamayib bo'lak reyestrda qolsa (yoki teskarisi) sverka o'sha zahoti
 * yolg'on farq berardi.
 *
 * Nomuvofiqlik (bo'laklar yig'indisi ≠ qator miqdori) sotuvni TO'XTATMAYDI —
 * to'lov paytida chekni rad etish 2026-08-24 hodisasining aynan shakli
 * bo'lardi. U `mismatches` bo'lib qaytadi va chaqiruvchi log'ga yozadi.
 */
export async function consumePiecesForSale(
  tx: Prisma.TransactionClient,
  accountId: string,
  positions: ReadonlyArray<{ id: string; quantity: string }>,
): Promise<{
  consumed: number;
  mismatches: Array<{ positionId: string; expected: string; pieces: string }>;
}> {
  if (positions.length === 0) return { consumed: 0, mismatches: [] };
  const positionIds = positions.map((p) => p.id);

  const pieces = await tx.stockPiece.findMany({
    where: { accountId, reservedPositionId: { in: positionIds } },
    select: { id: true, reservedPositionId: true, length: true, status: true },
  });
  if (pieces.length === 0) return { consumed: 0, mismatches: [] };

  const plan = planSaleConsumption(
    pieces.map((p) => ({
      id: p.id,
      reservedPositionId: p.reservedPositionId,
      length: p.length.toString(),
      status: p.status,
    })),
    positions,
  );
  if (plan.pieceIds.length === 0) return { consumed: 0, mismatches: plan.mismatches };

  const res = await tx.stockPiece.updateMany({
    where: { id: { in: plan.pieceIds } },
    data: {
      status: PIECE_STATUS.consumed,
      consumedAt: new Date(),
      consumedReason: PIECE_CONSUMED_REASON.sold,
    },
  });
  return { consumed: res.count, mismatches: plan.mismatches };
}

/**
 * `cancel()` — mijoz voz kechdi.
 *
 * 🔴 Bo'lak OMBORDA QOLADI (K-reja 2-bo'lim): kesilgan kabelni qaytarib
 * ulab bo'lmaydi, ya'ni 180 m yorlig'i bilan javonda turaveradi va ertaga
 * boshqa mijozga ketadi. Qoldiq bir grammga ham o'zgarmaydi — chunki kesim
 * uni hech qachon o'zgartirmagan edi. Uziladigan yagona narsa — «mijoz
 * oldida turibdi» bog'lanishi (aks holda bo'lak abadiy band bo'lib qolardi).
 */
export async function releasePiecesForSale(
  tx: Prisma.TransactionClient,
  accountId: string,
  saleId: string,
): Promise<number> {
  const res = await tx.stockPiece.updateMany({
    where: { accountId, reservedSaleId: saleId, status: PIECE_STATUS.active },
    data: { reservedSaleId: null, reservedPositionId: null },
  });
  return res.count;
}
