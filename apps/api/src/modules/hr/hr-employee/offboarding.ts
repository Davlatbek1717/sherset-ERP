/**
 * Xodimni bo'shatish ro'yxati (menejer TZ 4M.4 — «hayot sikli»).
 *
 * MUAMMO. Hozir bo'shatish = `archived: true` bitta bayrog'i. Tekshirildi:
 * **login va refresh allaqachon yopiq** (`auth.service` `archived` ni ko'radi),
 * ya'ni «xodim ertasi kuni tizimga kiraveradi» degan qo'rquv asossiz. Lekin
 * quyidagilar HAQIQATAN ochiq qoladi:
 *   • **Telegram bog'lami** — ketgan odam kompaniya xabarlarini olishda davom etadi;
 *   • **ochiq kassa smenasi** — yashiqdagi pul hech kimning javobgarligida emas;
 *   • **qabul qilinmagan KPI kunlari** — oylik abadiy bloklangan holda qoladi;
 *   • **jihoz** (telefon, skaner, kalit) — MK05 gacha tizim bilmasdi, hech kim
 *     so'ramasdi; endi reyestrdagi ochiq biriktirish ko'rsatadi.
 *
 * YECHIM: bo'shatish — bir bosishlik bayroq emas, **ro'yxat**. Ro'yxat
 * tugamaguncha xodim `arxivlangan` holatiga o'tmaydi.
 *
 * ⚠️ **ASOSIY QAROR: tizim biladigan narsani odamdan SO'RAMAYMIZ.** «Telegram
 * uzildimi?» degan katakchani qo'lda belgilash — yolg'onga ochiq eshik: odam
 * belgilaydi, Telegram esa ulangan qoladi. Shuning uchun har band `auto` yoki
 * `manual`: `auto` bandni tizim **o'zi tekshiradi** va uni qo'lda «bajarildi»
 * deb belgilab bo'lmaydi.
 *
 * Sof modul — bandlar ro'yxati va «tugadimi» qoidasi DB'siz sinaladi.
 */

export const OFFBOARDING_ITEM = {
  /** Telegram bog'lami uzilgan (auto: `telegramChatId` bo'sh). */
  telegramUnbound: 'telegram_unbound',
  /** Ochiq kassa smenasi qolmagan (auto). */
  shiftsClosed: 'shifts_closed',
  /** Qabul qilinmagan KPI kunlari qolmagan (auto) — oylik bloklanmasin. */
  kpiDaysClosed: 'kpi_days_closed',
  /** HR/ERP rollari olib tashlangan (auto: `hrRoles` bo'sh). */
  rolesRevoked: 'roles_revoked',
  /** Kassa/naqd topshirilgan (qo'lda tasdiq — tizim yashiqni ko'rmaydi). */
  cashHandedOver: 'cash_handed_over',
  /**
   * Jihoz qaytarilgan: telefon, skaner, kalit.
   *
   * **MK05 dan boshlab `auto`** — jihoz reyestri (`Equipment` +
   * `EquipmentAssignment`) paydo bo'ldi, ya'ni «kimda nima turibdi» tizimga
   * MA'LUM. Ilgari qo'lda tasdiq edi: reyestrsiz tizim hech narsa bilmasdi
   * va katakcha faqat odamning so'ziga tayanardi.
   */
  equipmentReturned: 'equipment_returned',
} as const;

export type OffboardingItemKey = (typeof OFFBOARDING_ITEM)[keyof typeof OFFBOARDING_ITEM];

/** Band qanday yopiladi. */
export const ITEM_KIND = {
  /** Tizim o'zi tekshiradi — qo'lda belgilab bo'lmaydi. */
  auto: 'auto',
  /** Odam tasdiqlaydi (tizim ko'rmaydigan jismoniy narsa). */
  manual: 'manual',
} as const;

export type ItemKind = (typeof ITEM_KIND)[keyof typeof ITEM_KIND];

export interface OffboardingItemDef {
  key: OffboardingItemKey;
  kind: ItemKind;
  /** Bajarilmasa arxivlashga YO'L QO'YMAYDI. */
  blocking: boolean;
  label: string;
}

/**
 * Ro'yxat.
 *
 * Hammasi `blocking: true` — bu ataylab. «Ixtiyoriy band» degan tushuncha
 * ro'yxatning ma'nosini yo'qotardi: kim bo'lsa ham eng noqulay bandni
 * ixtiyoriy deb belgilab, o'tkazib yuborardi. Band kerak bo'lmasa — u
 * ro'yxatda umuman bo'lmasligi kerak.
 */
export const OFFBOARDING_ITEMS: ReadonlyArray<OffboardingItemDef> = [
  {
    key: OFFBOARDING_ITEM.telegramUnbound,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Telegram bog`lami uzilgan',
  },
  {
    key: OFFBOARDING_ITEM.shiftsClosed,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Ochiq kassa smenasi yo`q',
  },
  {
    key: OFFBOARDING_ITEM.kpiDaysClosed,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Qabul qilinmagan KPI kunlari yo`q',
  },
  {
    key: OFFBOARDING_ITEM.rolesRevoked,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Rollar olib tashlangan',
  },
  {
    key: OFFBOARDING_ITEM.cashHandedOver,
    kind: ITEM_KIND.manual,
    blocking: true,
    label: 'Kassa/naqd topshirilgan',
  },
  {
    key: OFFBOARDING_ITEM.equipmentReturned,
    kind: ITEM_KIND.auto,
    blocking: true,
    label: 'Jihoz qaytarilgan (telefon, skaner, kalit)',
  },
];

export function itemDef(key: string): OffboardingItemDef | null {
  return OFFBOARDING_ITEMS.find((i) => i.key === key) ?? null;
}

// ── Holat hisobi ─────────────────────────────────────────────────────────────

/** Tizim tekshiruvidan kelgan faktlar. */
export interface AutoFacts {
  telegramChatId: string | null;
  openShiftCount: number;
  pendingKpiDays: number;
  roleCount: number;
  /** Qaytarilmagan (ochiq biriktirishdagi) jihozlar soni — MK05 reyestri. */
  openEquipmentCount: number;
}

/** Qo'lda tasdiqlangan bandlar. */
export interface ManualState {
  [key: string]: { doneAt: Date; byId: string | null } | undefined;
}

export interface ItemStatus extends OffboardingItemDef {
  done: boolean;
  /** `auto` bandda — nega bajarilmagani (raqam bilan). */
  detail: string | null;
  doneAt: Date | null;
}

/**
 * Har bandning holati.
 *
 * `auto` bandlar HAR SAFAR qaytadan tekshiriladi: bir marta bajarilgan deb
 * yozib qo'yish keyin ochilib qolgan smenani ko'rinmas qilardi.
 */
export function evaluateItems(facts: AutoFacts, manual: ManualState): ItemStatus[] {
  return OFFBOARDING_ITEMS.map((def) => {
    if (def.kind === ITEM_KIND.auto) {
      const { done, detail } = autoStatus(def.key, facts);
      return { ...def, done, detail, doneAt: null };
    }
    const m = manual[def.key];
    return { ...def, done: !!m, detail: null, doneAt: m?.doneAt ?? null };
  });
}

function autoStatus(
  key: OffboardingItemKey,
  f: AutoFacts,
): { done: boolean; detail: string | null } {
  switch (key) {
    case OFFBOARDING_ITEM.telegramUnbound:
      return { done: f.telegramChatId === null, detail: f.telegramChatId ? 'ulangan' : null };
    case OFFBOARDING_ITEM.shiftsClosed:
      return {
        done: f.openShiftCount === 0,
        detail: f.openShiftCount > 0 ? `${f.openShiftCount} ta ochiq smena` : null,
      };
    case OFFBOARDING_ITEM.kpiDaysClosed:
      return {
        done: f.pendingKpiDays === 0,
        detail: f.pendingKpiDays > 0 ? `${f.pendingKpiDays} kun qabul kutmoqda` : null,
      };
    case OFFBOARDING_ITEM.rolesRevoked:
      return {
        done: f.roleCount === 0,
        detail: f.roleCount > 0 ? `${f.roleCount} ta rol` : null,
      };
    case OFFBOARDING_ITEM.equipmentReturned:
      return {
        done: f.openEquipmentCount === 0,
        detail: f.openEquipmentCount > 0 ? `${f.openEquipmentCount} ta jihoz qaytarilmagan` : null,
      };
    default:
      return { done: false, detail: null };
  }
}

export interface OffboardingProgress {
  items: ItemStatus[];
  doneCount: number;
  total: number;
  /** Bloklovchi bandlarning hammasi bajarilganmi — arxivlash SHARTI. */
  canArchive: boolean;
  /** Qolgan bloklovchi bandlar — xabarda aynan shular ko'rsatiladi. */
  blockers: ItemStatus[];
}

/**
 * Umumiy holat.
 *
 * `canArchive` faqat **bloklovchi** bandlarga qaraydi. Hozir hammasi
 * bloklovchi, lekin shart aynan shu tarzda yozilgan: kelajakda ixtiyoriy
 * band qo'shilsa, u arxivlashni to'sib qo'ymasligi kerak.
 */
export function offboardingProgress(facts: AutoFacts, manual: ManualState): OffboardingProgress {
  const items = evaluateItems(facts, manual);
  const blockers = items.filter((i) => i.blocking && !i.done);
  return {
    items,
    doneCount: items.filter((i) => i.done).length,
    total: items.length,
    canArchive: blockers.length === 0,
    blockers,
  };
}

/**
 * Qo'lda belgilash MUMKINmi.
 *
 * `auto` bandni qo'lda yopishga urinish rad etiladi — aks holda ro'yxat
 * o'zini o'zi aldash vositasiga aylanardi: odam «Telegram uzildi» deb
 * belgilaydi, bog'lam esa turaveradi.
 */
export function canMarkManually(key: string): boolean {
  return itemDef(key)?.kind === ITEM_KIND.manual;
}
