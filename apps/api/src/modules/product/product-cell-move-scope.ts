/**
 * G6 — YACHEYKA KO'CHIRISH/JOYLASHTIRISH AMALINING RUXSAT DARAJASI (sof modul).
 *
 * 🔴 MUAMMO (G6 sessiyasida o'lchandi). Reja G6.2 aytadi: TSD da joylashtirish
 * va ko'chirish FAQAT `cell-move` / `cell-place` orqali bo'ladi. Lekin bu ikki
 * marshrut `store.update` talab qilardi va TSD foydalanuvchisi — kichik
 * omborchi (`storekeeper`), uning shablonida esa `store.update = NO` (bu
 * ATAYLAB va `store-cell-permission.test.ts` bilan qulflangan: omborchi ombor
 * KARTOCHKASINI tahrirlamaydi). Ya'ni G6.2 birinchi klikdayoq 403 bo'lardi.
 *
 * 🔴 QAROR — ikki darajali:
 *
 *  1. **Bazaviy talab `storecell.update`** (marshrut dekoratorida). Sabab:
 *     yacheyka ichida tovarni siljitish — omborchining ASOSIY ishi, xuddi
 *     «Sanash» kabi (u ham `storecell.update` va u ham store-darajali
 *     qoldiqni o'zgartira oladi — avto Оприходование/Списание orqali).
 *     Ombor KARTOCHKASI (nomi, prioriteti, belgilari) tegilmaydi.
 *
 *  2. **Omborlararo ko'chirish uchun QO'SHIMCHA `store.update`** — BITTA
 *     istisno bilan: manba HOVUZ-ombor bo'lsa (`__unassignedSource`,
 *     «Taqsimlanmagan»). Sabablari:
 *      · hovuz fizik ombor emas, hisob-kitob hovuzi — undan haqiqiy omborga
 *        ko'chirish aynan F7 ning kundalik oqimi («sanadim → tizim o'zi
 *        to'g'ri omborga o'tkazdi») va uni bloklash G6 ni ma'nosiz qilardi;
 *      · haqiqiy ombordan haqiqiy omborga ko'chirish esa BOShQA klass —
 *        u tovarni bino orasida siljitadi va katta omborchining qarori.
 *
 * Nega sof modul: bu qoida servis ichida `if` bo'lib qolsa hech qachon
 * testda qulflanmaydi va keyingi faza uni jimgina kengaytirardi (ruxsat
 * kengayishi — jim va qaytarilishi qiyin xato klassi).
 */

/** Amal uchun TALAB qilinadigan qo'shimcha daraja. */
export type CellOpScope = 'storecell' | 'store';

export interface CrossStoreTake {
  /** Manba ombor. */
  storeId: string;
  /** Bu manba maqsad ombordan BOSHQAmi. */
  crossStore: boolean;
}

/**
 * Ko'chirish/joylashtirish uchun kerakli daraja.
 *
 * `poolStoreId = null` (hovuz belgilanmagan akkaunt) — har qanday omborlararo
 * ko'chirish `store.update` talab qiladi, ya'ni xulq shu paytgacha
 * qanday bo'lsa shunday (fail-closed).
 */
export function requiredCellOpScope(
  takes: ReadonlyArray<CrossStoreTake>,
  poolStoreId: string | null,
): CellOpScope {
  const escalating = takes.some((t) => t.crossStore && t.storeId !== poolStoreId);
  return escalating ? 'store' : 'storecell';
}
