import type { Prisma } from '@moysklad/db';
import { BadRequestException } from '@nestjs/common';
import { PIECE_CONSUMED_REASON } from './piece-cut-core.js';
import {
  type IntakeEntry,
  intakeErrorMessage,
  parsePieceEntry,
  planPieceReturn,
  planRecount,
  planSupplyIntake,
  supplyIntakeErrorMessage,
} from './piece-intake-core.js';
import { PIECE_STATUS } from './stock-piece-core.js';
import { nextPieceSeq } from './stock-piece-registry-core.js';

/**
 * K5 — bo'lak reyestrini HUJJAT posting yo'llariga ulash.
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K5 fazasi.
 *
 * 🔴 **Bu modul ham `Stock`/`StockByCell` ga BIR QATOR HAM yozmaydi** — K1…K4
 * bilan AYNI intizom. Qoldiqni hujjatlarning O'Z posting yo'llari
 * (`inventory.service`, `supply.service`, `sales-return.service`) avvalgidek
 * o'zgartiradi; bu yerdagi yagona ish — `stock_pieces` ni o'sha hujjat aytgan
 * haqiqatga hizalash. Ikkalasi BIR tranzaksiyada yuradi (chaqiruvchi ochadi),
 * aks holda qoldiq to'g'rilanib reyestr eski qolardi va sverka o'sha zahoti
 * yolg'on farq berardi.
 *
 * ---------------------------------------------------------------------------
 * NEGA SINF EMAS, FUNKSIYALAR (K4 ning `consumePiecesForSale` naqshi).
 *
 * Bu funksiyalarni `InventoryService`, `SupplyService` va `SalesReturnService`
 * chaqiradi. Ularni Nest DI orqali bog'lash uchalasining ham konstruktoriga
 * yangi parametr qo'shishni talab qilardi va bu MAZMUNSIZ ravishda mavjud
 * test fayllarini o'zgartirardi (har biri servisni qo'lda quradi). Funksiya
 * `tx` ni argument sifatida oladi, ya'ni holati yo'q va DI kerak emas. Modul
 * chegarasi buzilmaydi: `stock_pieces` ga yozadigan kod HAMON `stock-piece`
 * modulida.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ YORLIQ RAQAMI POYGASI (halol qayd).
 *
 * Yangi yorliq raqami akkauntdagi eng katta yorliqdan olinadi (K2 `nextSeq`
 * bilan AYNI qoida). Ikki hujjat bir vaqtda post bo'lsa ikkalasi ham bir xil
 * raqamni ko'rishi mumkin:
 *   · **Serializable** tranzaksiyada (inventarizatsiya post'i) bu Postgres
 *     tomonidan `40001` bo'lib chiqadi va `withSerializationRetry` uni
 *     AVTOMAT qayta yuritadi — foydalanuvchi hech narsa sezmaydi;
 *   · boshqa izolyatsiyada `P2002` (unikal indeks) chiqadi va u ANIQ xato
 *     bo'lib qaytadi — omborchi qayta bosadi.
 * Ikkala holatda ham JIM DUBLIKAT YO'Q: `@@unique([accountId, label])` oxirgi
 * to'siq bo'lib qoladi (K1 qarori).
 */

// ---------------------------------------------------------------------------
// Umumiy
// ---------------------------------------------------------------------------

/** Reyestr doirasi: ombor × yacheyka × tovar (yacheykasiz bo'lsa `cellId=null`). */
export interface PieceScope {
  accountId: string;
  storeId: string;
  cellId: string | null;
  assortmentKind: string;
  assortmentId: string;
}

/** Kiritish matnini o'qiydi va xatoni 400 ga aylantiradi. */
export function parseEntryOrThrow(raw: string | null | undefined): IntakeEntry {
  const { entry, error, groupIndex } = parsePieceEntry(raw);
  if (!entry) {
    throw new BadRequestException(intakeErrorMessage(error ?? 'bad-group', groupIndex));
  }
  return entry;
}

/**
 * Akkauntdagi eng katta yorliqdan keyingi tartib raqami.
 *
 * K2/K4 dagi `nextSeq` bilan AYNI qoida (`label DESC` bo'yicha bitta qator).
 * Takrorlanish emas: bu yerda so'rov CHAQIRUVCHINING tranzaksiyasida ketadi.
 */
async function nextSeq(tx: Prisma.TransactionClient, accountId: string): Promise<number> {
  const last = await tx.stockPiece.findFirst({
    where: { accountId, label: { not: null } },
    orderBy: { label: 'desc' },
    select: { label: true },
  });
  return nextPieceSeq(last?.label ?? null);
}

function createRow(
  scope: PieceScope,
  row: { length: string; whole: boolean; label: string | null },
) {
  return {
    accountId: scope.accountId,
    storeId: scope.storeId,
    cellId: scope.cellId,
    assortmentKind: scope.assortmentKind,
    assortmentId: scope.assortmentId,
    length: row.length,
    whole: row.whole,
    label: row.label,
    status: PIECE_STATUS.active,
  };
}

// ---------------------------------------------------------------------------
// 1. SANASH (K5/1-vazifa)
// ---------------------------------------------------------------------------

export interface RecountOutcome {
  /** Tegilmagan qatorlar soni (yorliq QAYTA BOSILMAYDI). */
  kept: number;
  /** Uzunligi tuzatilganlar. */
  adjusted: number;
  /** Yangi ochilganlar. */
  created: number;
  /** Sanashda topilmagani uchun reyestrdan chiqqanlar. */
  closed: number;
  /** Bosilishi kerak bo'lgan yorliqlar. */
  labels: string[];
  /** Sanalgan, lekin bu doirada topilmagan yorliqlar (ogohlantirish). */
  unknownLabels: string[];
}

/**
 * Inventarizatsiya post'i: yacheykadagi reyestr sanoq natijasiga TENGLASHADI.
 *
 * MUTLAQ amal (`planRecount` izohiga qarang): omborchi javonni ko'zi bilan
 * ko'rib turibdi va uning ko'rgani — haqiqat. O'zgarish esa MINIMAL: yorlig'i
 * sanalgan va uzunligi o'zgarmagan bo'lak TEGILMAYDI, ya'ni yorliq qayta
 * bosilmaydi.
 *
 * 🔴 Doira (ombor × yacheyka × tovar) — sanoq qatorining O'Z doirasi. Boshqa
 * yacheykalarga TEGILMAYDI: omborchi bitta yacheykani sanadi, qolganlari
 * haqida hech narsa aytmadi. Bu F-rejaning «sanash faqat yacheyka kesimida»
 * qoidasining aynan o'zi.
 */
export async function applyPieceRecount(
  tx: Prisma.TransactionClient,
  scope: PieceScope,
  entry: IntakeEntry,
): Promise<RecountOutcome> {
  const existing = await tx.stockPiece.findMany({
    where: {
      accountId: scope.accountId,
      storeId: scope.storeId,
      cellId: scope.cellId,
      assortmentKind: scope.assortmentKind,
      assortmentId: scope.assortmentId,
      status: PIECE_STATUS.active,
    },
    select: { id: true, length: true, whole: true, label: true },
  });

  const plan = planRecount({
    existing: existing.map((p) => ({
      id: p.id,
      length: p.length.toString(),
      whole: p.whole,
      label: p.label,
    })),
    entry,
    startSeq: await nextSeq(tx, scope.accountId),
  });

  for (const a of plan.adjust) {
    await tx.stockPiece.update({ where: { id: a.id }, data: { length: a.length } });
  }

  if (plan.create.length > 0) {
    await tx.stockPiece.createMany({ data: plan.create.map((r) => createRow(scope, r)) });
  }

  if (plan.close.length > 0) {
    // Sanashda topilmadi ⇒ reyestrdan chiqadi. Sabab ALOHIDA (`recount`):
    // `closed` («tugadi», qo'lda) bilan aralashsa sverkadagi farqning MANBAI
    // ko'rinmay qolardi. Band bo'lgan bo'lak ham chiqadi va bog'lanishi
    // uziladi — u jismonan javonda YO'Q, ya'ni «mijoz oldida turibdi» yolg'on.
    await tx.stockPiece.updateMany({
      where: { id: { in: plan.close } },
      data: {
        status: PIECE_STATUS.consumed,
        consumedAt: new Date(),
        consumedReason: PIECE_CONSUMED_REASON.recount,
        reservedSaleId: null,
        reservedPositionId: null,
      },
    });
  }

  return {
    kept: plan.keep.length,
    adjusted: plan.adjust.length,
    created: plan.create.length,
    closed: plan.close.length,
    labels: plan.labels,
    unknownLabels: plan.unknownLabels,
  };
}

// ---------------------------------------------------------------------------
// 2. PRIYOMKA (K5/2-vazifa)
// ---------------------------------------------------------------------------

export interface SupplyIntakeOutcome {
  created: number;
}

/**
 * Priyomka post'i: kelgan rulonlar reyestrga tushadi.
 *
 * Faqat QO'SHADI — mavjud qatorlarga umuman tegmaydi (sanashdan asosiy farqi).
 * Sabab ravshan: priyomka «javonda nima bor» demaydi, «bugun nima keldi»
 * deydi. Mavjud bo'laklarni yopish uchun asos yo'q.
 */
export async function applySupplyPieceIntake(
  tx: Prisma.TransactionClient,
  scope: PieceScope,
  entry: IntakeEntry,
): Promise<SupplyIntakeOutcome> {
  const plan = planSupplyIntake(entry);
  if (plan.error) throw new BadRequestException(supplyIntakeErrorMessage(plan.error));

  const rows = plan.create ?? [];
  if (rows.length > 0) {
    await tx.stockPiece.createMany({ data: rows.map((r) => createRow(scope, r)) });
  }
  return { created: rows.length };
}

// ---------------------------------------------------------------------------
// 3. VOZVRAT (K5/3-vazifa)
// ---------------------------------------------------------------------------

export interface ReturnIntakeOutcome {
  /** `consumed` dan `active` ga qaytgan qatorlar. */
  restored: number;
  created: number;
  labels: string[];
  /** Allaqachon faol bo'lgani uchun qaytarilmagan yorliqlar. */
  alreadyActive: string[];
}

/**
 * Vozvrat post'i: mijoz olib ketgan bo'lak omborga QAYTADI.
 *
 * Yorlig'i tanilsa AYNAN o'sha qator tiklanadi (`sourcePieceId` tarixi va
 * mijozdagi yorliq raqami saqlanadi — `planPieceReturn` izohiga qarang), va
 * u qaytarilayotgan YACHEYKAGA ko'chadi: omborchi tovarni qayerga qo'ysa,
 * reyestr o'sha yerni ko'rsatishi kerak (aks holda bo'lak eski javonda
 * «turgan» bo'lib qolardi va sverka ikki yacheykada ham farq berardi).
 */
export async function applyReturnPieceIntake(
  tx: Prisma.TransactionClient,
  scope: PieceScope,
  entry: IntakeEntry,
): Promise<ReturnIntakeOutcome> {
  const labels = entry.pieces.map((p) => p.label).filter((l): l is string => l !== null);

  const found =
    labels.length > 0
      ? await tx.stockPiece.findMany({
          where: { accountId: scope.accountId, label: { in: labels } },
          select: { id: true, label: true, status: true, length: true },
        })
      : [];

  const plan = planPieceReturn({
    entry,
    found: found.flatMap((p) =>
      p.label ? [{ id: p.id, label: p.label, status: p.status, length: p.length.toString() }] : [],
    ),
    startSeq: await nextSeq(tx, scope.accountId),
  });

  for (const r of plan.restore) {
    await tx.stockPiece.update({
      where: { id: r.id },
      data: {
        status: PIECE_STATUS.active,
        consumedAt: null,
        consumedReason: null,
        length: r.length,
        storeId: scope.storeId,
        cellId: scope.cellId,
        reservedSaleId: null,
        reservedPositionId: null,
      },
    });
  }

  if (plan.create.length > 0) {
    await tx.stockPiece.createMany({ data: plan.create.map((r) => createRow(scope, r)) });
  }

  return {
    restored: plan.restore.length,
    created: plan.create.length,
    labels: plan.labels,
    alreadyActive: plan.alreadyActive,
  };
}
