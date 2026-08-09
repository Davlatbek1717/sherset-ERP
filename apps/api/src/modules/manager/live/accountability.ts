/**
 * Xodim JAVOBGARLIGI (menejer TZ 4M.4, M-Q10) — «kimda nima qolgan».
 *
 * Savol oddiy: xodim bugun ishga kelmasa yoki ketsa, uning ustida qanday
 * yopilmagan majburiyat qoladi. Bu ro'yxat bo'shatish ro'yxati bilan bir
 * manbadan quriladi, lekin BOSHQA savolga javob beradi: u yerda «arxivlash
 * mumkinmi», bu yerda «hozir kimda qancha osilib turibdi».
 *
 * **JIHOZ (telefon, skaner, kalit) — MK05 dan boshlab BU YERDA.** MK03'da
 * ataylab tashlangan edi: reyestr yo'q edi, «0 ta jihoz» esa menejerni yo'q
 * ma'lumotga ishontirardi. Endi manba bor (`Equipment` +
 * `EquipmentAssignment`) va son **o'lchangan** — ochiq biriktirishlar soni.
 *
 * ⚠️ Jihozning **puli yo'q**: reyestrda narx saqlanmaydi, taxminiy qiymatni
 * «kimda qancha pul» raqamiga qo'shish uni buzardi.
 *
 * Sof modul — og'irlik va tartib qoidalari DB'siz sinaladi.
 */

/** Majburiyat turi. */
export const DUTY = {
  /** Kassa smenasi ochiq — yashiqdagi pul shu odamning javobgarligida. */
  openShift: 'open_shift',
  /**
   * Smena yopilgan, lekin MENEJER hali qabul qilmagan (MK08).
   *
   * `openShift` dan AYRIM: u yerda yashiqdagi pul, bu yerda hujjat
   * javobgarligi. Bir qatorga qo'shish menejerga «yashiqda pul bor» degan
   * yolg'on signal berardi va naqd ikki marta sanalardi.
   */
  shiftUnaccepted: 'shift_unaccepted',
  /** Haydovchi qo'lidagi topshirilmagan naqd. */
  cashOnHand: 'cash_on_hand',
  /** Boshlangan-u tugallanmagan yig'ish. */
  pickingOpen: 'picking_open',
  /** Qabul qilinmagan KPI kunlari — oylikni bloklaydi. */
  kpiPending: 'kpi_pending',
  /** Qaytarilmagan jihoz — reyestrdagi ochiq biriktirish (MK05). */
  equipmentOut: 'equipment_out',
} as const;

export type DutyKind = (typeof DUTY)[keyof typeof DUTY];

export interface DutyRow {
  kind: DutyKind;
  count: number;
  /** Pulga bog'liq majburiyatda — summa (tiyin); aks holda `null`. */
  amountMinor: bigint | null;
  label: string;
}

export interface EmployeeDuties {
  employeeId: string;
  employeeName: string | null;
  duties: DutyRow[];
  /** Pul majburiyatlari jami — «kimda qancha pul» savoliga javob. */
  totalCashMinor: bigint;
  /** Barcha majburiyatlar soni. */
  totalCount: number;
}

export interface DutyInput {
  employeeId: string;
  employeeName: string | null;
  openShiftCount: number;
  /** Ochiq smenalardagi kutilgan naqd (tiyin). */
  openShiftCashMinor: bigint;
  pendingHandoverCount: number;
  pendingHandoverMinor: bigint;
  pickingCount: number;
  pendingKpiDays: number;
  /** Reyestrda ochiq (qaytarilmagan) biriktirishlar soni. */
  openEquipmentCount: number;
  /** Yopilgan-u menejer qabul qilmagan smenalar soni (MK08). */
  unacceptedShiftCount: number;
}

const LABELS: Record<DutyKind, string> = {
  [DUTY.openShift]: 'Ochiq kassa smenasi',
  [DUTY.shiftUnaccepted]: 'Qabul qilinmagan smena',
  [DUTY.cashOnHand]: "Topshirilmagan naqd (haydovchi qo'lida)",
  [DUTY.pickingOpen]: "Tugallanmagan yig'ish",
  [DUTY.kpiPending]: 'Qabul qilinmagan KPI kunlari',
  [DUTY.equipmentOut]: 'Qaytarilmagan jihoz',
};

/**
 * Bitta xodimning majburiyatlari.
 *
 * Nol majburiyatli qatorlar TASHLANADI: «Ochiq smena: 0» degan qator
 * ekranni to'ldirib, haqiqiy majburiyatni ko'rinmas qilardi.
 */
export function employeeDuties(input: DutyInput): EmployeeDuties {
  const duties: DutyRow[] = [];
  const push = (kind: DutyKind, count: number, amountMinor: bigint | null) => {
    if (count > 0) duties.push({ kind, count, amountMinor, label: LABELS[kind] });
  };

  push(DUTY.openShift, input.openShiftCount, input.openShiftCashMinor);
  // Pulsiz ATAYLAB: pul allaqachon topshirilgan, yashiqda emas. Summa
  // qo'shilsa bitta naqd ikki qatorda sanalardi.
  push(DUTY.shiftUnaccepted, input.unacceptedShiftCount, null);
  push(DUTY.cashOnHand, input.pendingHandoverCount, input.pendingHandoverMinor);
  push(DUTY.pickingOpen, input.pickingCount, null);
  push(DUTY.kpiPending, input.pendingKpiDays, null);
  push(DUTY.equipmentOut, input.openEquipmentCount, null);

  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    duties,
    // Faqat PUL majburiyatlari: yig'ish va KPI kunlarining summasi yo'q,
    // ularni pulga qo'shish «kimda qancha pul» raqamini buzardi.
    totalCashMinor: input.openShiftCashMinor + input.pendingHandoverMinor,
    totalCount: duties.reduce((n, d) => n + d.count, 0),
  };
}

export interface AccountabilityBoard {
  employees: EmployeeDuties[];
  /** Butun korxona bo'yicha osilib turgan naqd. */
  totalCashMinor: bigint;
  employeeCount: number;
}

/**
 * Taxta: PUL ko'p bo'lgan xodim tepada, keyin majburiyat soni bo'yicha.
 *
 * Pul birinchi — chunki yo'qolgan pulni qaytarib bo'lmaydi, yopilmagan
 * yig'ishni esa ertaga tugatsa bo'ladi. Pulsiz majburiyatlar (yig'ish,
 * KPI kunlari) ro'yxat oxirida qoladi, lekin YO'QOLMAYDI.
 */
export function buildAccountability(rows: ReadonlyArray<EmployeeDuties>): AccountabilityBoard {
  // Majburiyati YO'Q xodim ro'yxatga tushmaydi.
  const withDuties = rows.filter((r) => r.totalCount > 0);
  const sorted = [...withDuties].sort((a, b) => {
    if (a.totalCashMinor !== b.totalCashMinor) {
      return a.totalCashMinor > b.totalCashMinor ? -1 : 1;
    }
    return b.totalCount - a.totalCount;
  });
  return {
    employees: sorted,
    totalCashMinor: sorted.reduce((s, r) => s + r.totalCashMinor, 0n),
    employeeCount: sorted.length,
  };
}
