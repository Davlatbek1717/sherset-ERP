/**
 * Ma'lumot sifati bayrog'i — «bu raqamga qanchalik ishonish mumkin» (MK09).
 *
 * TZ: menejer kunlik KPI §2.4 (NULL ≠ 0 bayrog'i) va §0.2 (bugungi holat).
 *
 * NEGA `report/metrics/` DA: bu qatlam — «bir savolga bitta javob» joyi
 * (analitika TZ §4). Bayroq menejer ekranida ham, hisobotda ham AYNI qoida
 * bo'yicha hisoblanishi kerak; ikki joyda ikki ta'rif bo'lsa, bir sahifada
 * «to'liq», ikkinchisida «qisman» chiqib, bayroqning o'ziga ishonch yo'qoladi.
 *
 * 🔴 BUTUN MODULNI USHLAB TURGAN SHARTNOMA:
 *
 *   NULL = «o'lchanmagan» · 0 = «o'lchandi va nol»
 *
 * Ularni aralashtirish hisobotni yolg'onga aylantiradi. Bu mavhum xavf emas:
 * `profitability.service.ts` da tan narx `0::bigint AS cost` deb olingani uchun
 * HAR kassa cheki 100% marja bo'lib ko'ringan (analitika TZ X1, 1.2 da
 * tuzatilgan). Shu sababdan bu yerda NULL hech qachon nolga aylanmaydi va
 * mahraji yo'q ulush `0%` emas, `null` qaytaradi.
 */

import { percent } from './metrics.js';

/**
 * Sifat darajasi. Uchtadan ortiq daraja ATAYLAB yo'q: menejer ekranda ko'rib
 * bir soniyada qaror qilishi kerak, «87% ishonch» degan raqam qaror bermaydi.
 */
export const DATA_QUALITY = {
  /** O'lchandi va manba to'liq. */
  complete: 'complete',
  /** O'lchandi, LEKIN manbaning bir qismi yetishmaydi (kam ko'rsatilgan bo'lishi mumkin). */
  partial: 'partial',
  /** Umuman o'lchanmagan. **Nol EMAS** — javob yo'q. */
  uncollected: 'uncollected',
} as const;

export type DataQualityLevel = (typeof DATA_QUALITY)[keyof typeof DATA_QUALITY];

/**
 * Bitta ko'rsatkich qiymatining bayrog'i.
 *
 * Qiymatning YO'QLIGI `complete` bayrog'idan ustun turadi: manba «to'liq» deb
 * yozgan-u qiymat NULL bo'lsa, bu baribir o'lchanmagan. Aks holda bo'sh katak
 * ekranda «to'liq o'lchandi» bo'lib ko'rinardi.
 */
export function metricQuality(value: bigint | null, complete: boolean): DataQualityLevel {
  if (value == null) return DATA_QUALITY.uncollected;
  return complete ? DATA_QUALITY.complete : DATA_QUALITY.partial;
}

/**
 * Ko'p qatorli (xodim × kun) yig'indi uchun sanoq.
 *
 * `total` — umuman nechta qator ochilgan · `measured` — qiymati bor qatorlar ·
 * `partial` — qiymati BOR, lekin manbasi chala qatorlar.
 */
export interface QualitySample {
  total: number;
  measured: number;
  partial: number;
}

/** Qatorlardan sanoq. NULL qiymat `measured` ga QO'SHILMAYDI (nolga aylanmaydi). */
export function countSamples(
  rows: ReadonlyArray<{ value: bigint | null; complete: boolean }>,
): QualitySample {
  let measured = 0;
  let partial = 0;
  for (const r of rows) {
    if (r.value == null) continue;
    measured++;
    if (!r.complete) partial++;
  }
  return { total: rows.length, measured, partial };
}

/**
 * Yig'indi bayrog'i.
 *
 * Tartib muhim: avval «umuman o'lchanmagan» tekshiriladi. Aks holda hammasi
 * NULL bo'lgan (ya'ni `complete: false` qatorlardan iborat) ko'rsatkich
 * «qisman» bo'lib ko'rinardi — bu «bir qismi o'lchandi» degan yolg'on ma'no.
 *
 * O'LCHANMAGAN qator bayroqni TUSHIRMAYDI: buxgalterda kassa ko'rsatkichi
 * bo'lmasligi kamchilik emas. «Qisman» faqat *o'lchandi-yu manbasi chala*
 * degani (masalan chekning bir qismida tan narx muzlatilmagan).
 */
export function aggregateQuality(s: QualitySample): DataQualityLevel {
  if (s.measured <= 0) return DATA_QUALITY.uncollected;
  return s.partial > 0 ? DATA_QUALITY.partial : DATA_QUALITY.complete;
}

/**
 * Panelning umumiy bayrog'i.
 *
 * «To'liq» — faqat HAMMASI to'liq bo'lganda. «Yig'ilmagan» — faqat hammasi
 * yig'ilmagan bo'lganda. Aralash holat doim «qisman»: bitta yig'ilmagan blok
 * ham panelni «to'liq» deb atashga to'sqinlik qiladi.
 *
 * Bo'sh ro'yxat — «yig'ilmagan»: hech narsa tekshirilmagan holatni «to'liq»
 * deb ko'rsatish eng xavfli yolg'on bo'lardi.
 */
export function overallQuality(levels: readonly DataQualityLevel[]): DataQualityLevel {
  if (levels.length === 0) return DATA_QUALITY.uncollected;
  if (levels.every((l) => l === DATA_QUALITY.complete)) return DATA_QUALITY.complete;
  if (levels.every((l) => l === DATA_QUALITY.uncollected)) return DATA_QUALITY.uncollected;
  return DATA_QUALITY.partial;
}

/**
 * Ulush foizi (masalan «tan narxsiz cheklar ulushi»), ikki kasrgacha.
 *
 * Mahraj nol bo'lsa **null** — `0%` EMAS. Nol foiz «tekshirdik, muammo yo'q»
 * degan xotirjamlik beradi; aslida esa umuman o'lchov bo'lmagan.
 *
 * Bo'lish `metrics.percent` orqali (yagona formulalar qatlami): sanoqlar
 * BigInt'ga o'tkaziladi, ya'ni yaxlitlash hisobotdagi bilan bir xil.
 */
export function sharePercent(part: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return percent(BigInt(Math.trunc(part)), BigInt(Math.trunc(total)));
}
