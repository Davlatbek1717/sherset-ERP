import { formatDecimalScaled, parseDecimalScaled } from './decimal.js';
import { computeTransferCost } from './move-cost-basis.js';

/**
 * F7 (2026-08-23 ombor-restrukturizatsiya rejasi) — joylashtirish dvigateli.
 *
 * Split'dan keyin (F5) yacheykasiz qoldiq «Taqsimlanmagan» Store'ida yashaydi,
 * haqiqiy omborlarda esa Σyacheyka == Stock. Omborchi tovarni yacheykaga sanab
 * kiritganda bu ORTIQCHA emas — hovuzdan olib kelingan tovar. Ilgari sanash
 * `inventory_surplus` / avto-Оприходование bilan yangi qoldiq «yaratardi» va
 * jami shishardi (hovuz kamaymasdi). Endi sanalgan miqdor avval quyidagi
 * MANBALARDAN ko'chiriladi, faqat qoplanmagan qismi haqiqiy kirim bo'ladi:
 *
 *   1. o'sha omborning o'zidagi yacheykasiz qoldiq (Stock − Σyacheyka) —
 *      masalan Move hujjati bilan kelgan, hali joylashtirilmagan tovar;
 *      store-darajasi o'zgarmaydi (−store-only / +cellId juftligi 0 ga netlanadi);
 *   2. `__unassignedSource` belgisi qo'yilgan hovuz-ombor (Taqsimlanmagan) —
 *      haqiqiy omborlararo transfer: qty HAM tannarx ham ko'chadi
 *      (move-cost-basis bilan AYNAN bir arifmetika).
 *
 * Bu modul SOF: SQL/Prisma yo'q — chaqiruvchi (inventory post, setCellStock,
 * cell-place) balanslarni qulf ostida o'qib beradi, bu yer faqat taqsimot va
 * tannarx hisobini yuritadi. Miqdorlar micro-birlikda (BigInt, ×1e6) — float yo'q.
 */

/** Store.attributes ichidagi hovuz belgisi (F6 `__posPriority` naqshi — migratsiya yo'q). */
export const UNASSIGNED_SOURCE_KEY = '__unassignedSource';

/** attributes JSON'idan hovuz belgisini o'qiydi — faqat aynan `true` hisoblanadi. */
export function readUnassignedSource(attributes: unknown): boolean {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
  return (attributes as Record<string, unknown>)[UNASSIGNED_SOURCE_KEY] === true;
}

export interface PlacementSourceInit {
  storeId: string;
  /** Stock.qty (Decimal string) — tannarx asosi shu miqdorga bo'linadi. */
  qty: string;
  /** Σ StockByCell shu omborda (Decimal string) — remainder = qty − shu. */
  assignedQty: string;
  /** Stock.reservedQty — rezervlangan tovar hovuzdan talanmaydi. */
  reservedQty: string;
  costBalanceMinor: bigint;
  /** true — manba MAQSAD ombordan boshqa Store (tannarx ham ko'chadi). */
  crossStore: boolean;
}

export interface PlacementTake {
  storeId: string;
  /** Decimal string, doim > 0. */
  qty: string;
  /** Ko'chib o'tadigan tannarx (tiyin); crossStore=false bo'lsa 0n. */
  costMinor: bigint;
  crossStore: boolean;
}

/**
 * Bitta (manba-ombor × tovar) holati. `take()` KETMA-KET chaqiruvlarda ichki
 * holatni kamaytirib boradi (bir hujjatda bir tovar bir nechta yacheykaga
 * sanalishi mumkin) — warehouse-split'dagi sequential cost bilan bir intizom:
 * manba bo'shaganda qoldiq tiyin TO'LIQ ketadi, yaxlitlash yo'qotmaydi.
 */
export class PlacementSource {
  readonly storeId: string;
  readonly crossStore: boolean;
  private qtyMicro: bigint;
  private assignedMicro: bigint;
  private readonly reservedMicro: bigint;
  private costMinor: bigint;

  constructor(init: PlacementSourceInit) {
    this.storeId = init.storeId;
    this.crossStore = init.crossStore;
    this.qtyMicro = parseDecimalScaled(init.qty);
    this.assignedMicro = parseDecimalScaled(init.assignedQty);
    this.reservedMicro = parseDecimalScaled(init.reservedQty);
    this.costMinor = init.costBalanceMinor;
  }

  /** Joylashtirish uchun bo'sh qoldiq: max(0, qty − Σyacheyka − rezerv). */
  availableMicro(): bigint {
    const avail = this.qtyMicro - this.assignedMicro - this.reservedMicro;
    return avail > 0n ? avail : 0n;
  }

  /**
   * `wantMicro` dan shu manba qoplay oladiganini oladi. Mutatsiya:
   *   crossStore — qty va costBalance kamayadi (tovar ombordan KETDI);
   *   sameStore — assigned ko'payadi (tovar yacheykaga KIRDI, store jami turadi).
   * Qaytadi: olingan micro + ko'chadigan tannarx (sameStore ⇒ 0n).
   */
  take(wantMicro: bigint): { takeMicro: bigint; costMinor: bigint } {
    if (wantMicro <= 0n) return { takeMicro: 0n, costMinor: 0n };
    const avail = this.availableMicro();
    const takeMicro = wantMicro < avail ? wantMicro : avail;
    if (takeMicro <= 0n) return { takeMicro: 0n, costMinor: 0n };

    if (!this.crossStore) {
      this.assignedMicro += takeMicro;
      return { takeMicro, costMinor: 0n };
    }

    const { baseLineMinor } = computeTransferCost({
      sourceCostBalanceMinor: this.costMinor,
      sourceQty: formatDecimalScaled(this.qtyMicro),
      moveQty: formatDecimalScaled(takeMicro),
    });
    this.qtyMicro -= takeMicro;
    this.costMinor -= baseLineMinor;
    return { takeMicro, costMinor: baseLineMinor };
  }
}

/**
 * Tartiblangan manbalar bo'ylab ochko'z taqsimot. Qaytadi: har manbadan olingan
 * bo'laklar (bo'sh manbalar tashlab ketiladi) — yig'indisi `wantMicro` dan kam
 * bo'lishi mumkin (qolgani chaqiruvchida «haqiqiy kirim» bo'ladi).
 */
export function allocatePlacement(sources: PlacementSource[], wantMicro: bigint): PlacementTake[] {
  const takes: PlacementTake[] = [];
  let remaining = wantMicro;
  for (const s of sources) {
    if (remaining <= 0n) break;
    const { takeMicro, costMinor } = s.take(remaining);
    if (takeMicro <= 0n) continue;
    takes.push({
      storeId: s.storeId,
      qty: formatDecimalScaled(takeMicro),
      costMinor,
      crossStore: s.crossStore,
    });
    remaining -= takeMicro;
  }
  return takes;
}

/** Takes yig'indisi (micro) — chaqiruvchi qoplanmagan qismni hisoblashi uchun. */
export function totalTakenMicro(takes: PlacementTake[]): bigint {
  let sum = 0n;
  for (const t of takes) sum += parseDecimalScaled(t.qty);
  return sum;
}
