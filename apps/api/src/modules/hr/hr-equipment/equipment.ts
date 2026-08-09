/**
 * Jihoz reyestri (menejer TZ 4M §6.4 «kimda nima turibdi», §6.3 hayot sikli).
 *
 * MUAMMO (MK03/MK05 da tasdiqlangan). Tizimda jihoz reyestri UMUMAN yo'q edi:
 * telefon, skaner, kalit kimdaligini hech qayer bilmasdi. Oqibati ikki joyda
 * ko'rindi:
 *   • javobgarlik taxtasida jihoz bloki **ataylab tashlangan** edi — «0 ta
 *     jihoz» yo'q ma'lumotga ishontirardi;
 *   • bo'shatish ro'yxatidagi «Jihoz topshirilgan» bandi **qo'lda tasdiq**
 *     bo'lib qolgandi, ya'ni ketayotgan odam haqida tizim hech narsa
 *     bilmasdan katakcha belgilanardi.
 *
 * YECHIM: reyestr + biriktirish TARIXI (append-only). Shundan keyin ikkala
 * joy ham **tizim biladigan** faktga tayanadi.
 *
 * ⚠️ **Ikki asosiy qoida** (ikkalasi ham «qo'lda aldash» yo'lini yopadi):
 *   1. «Kimda» — faqat OCHIQ biriktirish qatoridan. `assigned` holatini
 *      qo'lda tanlab bo'lmaydi.
 *   2. Biriktirilgan jihozni **hisobdan chiqarib bo'lmaydi** — avval
 *      qaytarilsin. Aks holda javobgarlikni jimgina o'chirish yo'li ochiq
 *      qolardi (bo'shatish ro'yxati ham, taxta ham uni ko'rmay qolardi).
 *
 * Sof modul — qoidalar DB'siz sinaladi (`equipment.test.ts`).
 */

/** Reyestrdagi holat. */
export const EQUIPMENT_STATUS = {
  /** Omborda, bo'sh — biriktirilishi mumkin. */
  inStock: 'in_stock',
  /** Xodimda. Bu holat QO'LDA tanlanmaydi — ochiq biriktirishdan kelib chiqadi. */
  assigned: 'assigned',
  /** Ta'mirda/tekshiruvda — qaytarilgan-u ishga yaroqsiz. */
  repair: 'repair',
  /** Hisobdan chiqarilgan. */
  writtenOff: 'written_off',
  /** Yo'qolgan. O'CHIRILMAYDI — yo'qolgan jihoz izsiz ketmasin. */
  lost: 'lost',
} as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[keyof typeof EQUIPMENT_STATUS];

export const EQUIPMENT_STATUSES: ReadonlyArray<EquipmentStatus> = Object.values(EQUIPMENT_STATUS);

export function isEquipmentStatus(v: unknown): v is EquipmentStatus {
  return typeof v === 'string' && (EQUIPMENT_STATUSES as ReadonlyArray<string>).includes(v);
}

/** Qaytarish sharti — holatni AYNAN shu belgilaydi. */
export const RETURN_CONDITION = {
  ok: 'ok',
  damaged: 'damaged',
  lost: 'lost',
} as const;

export type ReturnCondition = (typeof RETURN_CONDITION)[keyof typeof RETURN_CONDITION];

export const RETURN_CONDITIONS: ReadonlyArray<ReturnCondition> = Object.values(RETURN_CONDITION);

/** Qo'lda tanlash mumkin bo'lgan holatlar — `assigned` ATAYLAB yo'q. */
const MANUAL_STATUSES: ReadonlyArray<EquipmentStatus> = [
  EQUIPMENT_STATUS.inStock,
  EQUIPMENT_STATUS.repair,
  EQUIPMENT_STATUS.writtenOff,
  EQUIPMENT_STATUS.lost,
];

/**
 * Biriktirish mumkinmi — mumkin bo'lmasa SABAB qaytadi (`null` = mumkin).
 *
 * Ochiq biriktirish holat ustunidan USTUN turadi: holat qo'lda tahrirlanib
 * yoki eski ma'lumotdan buzilib qolishi mumkin, ochiq qator esa fakt.
 */
export function assignBlockReason(status: string, hasOpenAssignment: boolean): string | null {
  if (hasOpenAssignment) return 'Jihoz boshqa xodimda — avvalgisi qaytarilmagan';
  switch (status) {
    case EQUIPMENT_STATUS.inStock:
      return null;
    case EQUIPMENT_STATUS.assigned:
      // Ochiq qatorsiz `assigned` — ma'lumot nomuvofiqligi; jim biriktirish
      // uni yashirardi.
      return 'Jihoz biriktirilgan deb belgilangan, lekin qaytarilmagan yozuvi yo`q';
    case EQUIPMENT_STATUS.repair:
      return 'Jihoz ta`mirda';
    case EQUIPMENT_STATUS.writtenOff:
      return 'Jihoz hisobdan chiqarilgan';
    case EQUIPMENT_STATUS.lost:
      return 'Jihoz yo`qolgan deb belgilangan';
    default:
      return `Noma'lum holat: ${status}`;
  }
}

/**
 * Qaytarilgandan keyingi holat.
 *
 * Noma'lum shart «soz» deb qaraladi: qator baribir YOPILADI — aks holda
 * xato qiymat tufayli biriktirish abadiy ochiq qolib, xodim bo'shata
 * olmaydigan holatga tushardi.
 */
export function statusAfterReturn(condition: string): EquipmentStatus {
  switch (condition) {
    case RETURN_CONDITION.damaged:
      return EQUIPMENT_STATUS.repair;
    case RETURN_CONDITION.lost:
      return EQUIPMENT_STATUS.lost;
    default:
      return EQUIPMENT_STATUS.inStock;
  }
}

/**
 * Qo'lda holat o'zgartirish mumkinmi — mumkin bo'lmasa SABAB (`null` = mumkin).
 *
 * Biriktirilgan jihozning holatini o'zgartirish TAQIQ: «hisobdan chiqarildi»
 * bosish bilan javobgarlikni o'chirish mumkin bo'lmasin.
 */
export function manualStatusBlockReason(next: string, hasOpenAssignment: boolean): string | null {
  if (!isEquipmentStatus(next)) return `Noma'lum holat: ${next}`;
  if (!(MANUAL_STATUSES as ReadonlyArray<string>).includes(next)) {
    return '«Xodimda» holati qo`lda tanlanmaydi — u biriktirishdan kelib chiqadi';
  }
  if (hasOpenAssignment) {
    return 'Jihoz xodimda turibdi — avval qaytarilsin';
  }
  return null;
}

/** Bo'sh inventar raqami NULL: bo'sh satr «takroriy raqam» to'qnashuvini yaratardi. */
export function normalizeInventoryNo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
}
