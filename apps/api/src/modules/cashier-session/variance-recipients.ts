/**
 * P4 / H7 — SMENA FARQI XABARI KIMGA BORADI (sof modul).
 *
 * ## O'lchangan nosozlik (prod, 2026-08-12)
 * Farq akti yozilganda xabar `hrTelegramOutbox` ga `toSelf: true` bilan
 * tushardi. `toSelf` — direktorning O'Z akkauntidagi «Saved Messages», ya'ni
 * **slot 0** MTProto seansi kerak. Prodda esa faqat **slot 1** ulangan:
 *
 *   `hr_telegram_account` → 1 qator: slot=1, +998919258700
 *   `hr_telegram_outbox`  → to_self=true: 4 ta `failed`
 *                            (`mtproto_self_no_client: slot=0`, oxirgisi 10-avgust)
 *                          → to_self=false: 32 ta `sent` (hammasi `sent_by_slot=1`)
 *
 * Ya'ni farq xabari yozilardi, lekin **hech qachon yetib bormasdi** — kod
 * tomondan «wiring bor» ko'rinardi (reja §1.H — H7 aynan shu shubha).
 *
 * ## Qaror (egasi, 2026-08-12): telefon orqali, RUXSATLI xodimlarga
 * Xuddi ishlayotgan `supply_approval_admin` yo'li kabi. Kim «ruxsatli» —
 * `cashiersession.approve` (smenani QABUL QILISH huquqi). Ataylab `update`
 * EMAS: `update` kassirning o'zida ham `ALL` (u o'z smenasini yopadi), ya'ni
 * `update` bo'yicha tanlash farq xabarini KASSIRLARGA tarqatardi.
 *
 * ## Qamrov (scope) hurmat qilinadi
 * Xabar ANIQ bir smena haqida, shuning uchun qamrov ham shu smenaga nisbatan
 * o'qiladi (`hr-guard-fallback-any-scope` saboqi — «zaxira sifatida hammasini
 * yubor» aynan shu yerda maxfiylik teshigi bo'lardi):
 *
 *   `ALL`       → har doim oladi (egasi/administrator);
 *   `OWN_GROUP` → faqat smena EGASINING guruhidagi menejer;
 *   `OWN`       → faqat smenaning O'Z kassiri (o'z farqini o'zi ko'radi);
 *   `NO`        → hech qachon (chaqiruvchi bunday qatorni umuman so'ramaydi).
 *
 * ## Telefonsiz xodim — qabul qiluvchi EMAS
 * `telegramPhone` bo'sh bo'lsa yuborib bo'lmaydi. Bunday xodim jimgina
 * tashlanmaydi — chaqiruvchi qabul qiluvchi topilmaganini JURNALGA yozadi va
 * eski `toSelf` yo'liga qaytadi (zaxira), ya'ni xabar hech bo'lmasa
 * o'lchanadigan joyda qoladi.
 */

/** `role_permissions.scope` lug'ati — shu modul o'qiydigan qismi. */
export type VarianceScope = 'ALL' | 'OWN_GROUP' | 'OWN' | 'NO';

export interface VarianceCandidate {
  readonly employeeId: string;
  readonly telegramPhone: string | null;
  /**
   * Xodimning `cashiersession.approve` bo'yicha AMALDAGI qamrovi.
   *
   * Chaqiruvchi uni kanonik `resolveEffective()` bilan hisoblaydi (rollar
   * MAX'i + MK26 override). Bu modul qayta hisoblamaydi: override rol
   * natijasini ko'taradi ham, TUSHIRADI ham — «MAX» deb takrorlash
   * cheklangan xodimni jimgina qabul qiluvchiga aylantirardi
   * (`mk26-permission-override-contracts`).
   */
  readonly scope: VarianceScope;
  readonly groupId: string | null;
}

export interface VarianceSessionRef {
  readonly cashierId: string;
  /** Smenaning guruhi (`CashierSession.groupId` — yaratuvchining guruhi). */
  readonly groupId: string | null;
}

export interface VarianceRecipient {
  readonly employeeId: string;
  readonly phone: string;
}

/**
 * Xabar boradigan telefonlar. Tartib barqaror (kirish tartibi), takror yo'q:
 * bitta telefon ikki xodimga yozilgan bo'lsa ham xabar BIR marta ketadi.
 */
export function selectVarianceRecipients(
  candidates: readonly VarianceCandidate[],
  session: VarianceSessionRef,
): VarianceRecipient[] {
  const out: VarianceRecipient[] = [];
  const seenPhones = new Set<string>();

  for (const c of candidates) {
    const phone = c.telegramPhone?.trim();
    if (!phone) continue;
    if (!reaches(c, session)) continue;
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    out.push({ employeeId: c.employeeId, phone });
  }
  return out;
}

function reaches(c: VarianceCandidate, session: VarianceSessionRef): boolean {
  switch (c.scope) {
    case 'ALL':
      return true;
    case 'OWN_GROUP':
      // Guruhsiz xodim yoki guruhsiz smena — moslik ISBOTLANMAGAN.
      // «Guruh yo'q = hammasi mos» qoidasi begona smenani ochib yuborardi.
      return c.groupId != null && session.groupId != null && c.groupId === session.groupId;
    case 'OWN':
      return c.employeeId === session.cashierId;
    default:
      return false;
  }
}
