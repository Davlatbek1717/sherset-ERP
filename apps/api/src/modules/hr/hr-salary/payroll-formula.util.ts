/**
 * Final salary formula (master spec § 0):
 *
 *   finalSalary = fixComponent + kpiEarned + bonusSum − fineSum + commission
 *
 * Pure BigInt arithmetic — every component is already in tiyin (minor
 * units). No Number coercion anywhere on the money path. fineSum is
 * SUBTRACTED; the result MAY be negative if fines exceed everything else
 * (caller decides whether to floor at 0 — we return the true signed value
 * so the Oylik UI can flag an underwater month).
 */
export interface SalaryComponents {
  /**
   * Eskirgan kunlar tuzatmasining SOF summasi (§3.4) — ixtiyoriy.
   *
   * Ataylab ixtiyoriy: bu komponent 4M.3 da qo'shildi va tuzatmasi yo'q
   * oylarda umuman bo'lmaydi. Majburiy qilinsa har chaqiruvchi `0n` yozishi
   * kerak bo'lardi va o'sha `0n` «tuzatma yo'q» bilan «hisoblanmagan» ni
   * aralashtirardi.
   */
  correctionNetMinor?: bigint;

  fixComponentMinor: bigint;
  kpiEarnedMinor: bigint;
  bonusSumMinor: bigint;
  fineSumMinor: bigint;
  commissionMinor: bigint;
}

export function computeFinalSalaryMinor(c: SalaryComponents): bigint {
  return (
    c.fixComponentMinor +
    c.kpiEarnedMinor +
    c.bonusSumMinor -
    c.fineSumMinor +
    c.commissionMinor +
    // TZ §3.4 — eskirgan kunlarning TUZATUVCHI QATORI. Alohida qo'shiluvchi:
    // to'langan oyning KPI raqami qayta yozilmaydi, farq shu oyda ko'rinadi.
    // Musbat = qo'shimcha to'lov, manfiy = ushlanma. `?? 0n` xavfsiz: tuzatma
    // yo'q oyda komponent umuman bo'lmaydi (eski chaqiruvchilar buzilmaydi).
    (c.correctionNetMinor ?? 0n)
  );
}

/**
 * Extract a per-employee base (fix) salary from Employee.salaryConfig Json.
 * Expected shape `{ baseSalaryMinor: string | number }`. Anything missing
 * or malformed → 0n (employee has no fixed component this month).
 */
export function extractBaseSalaryMinor(salaryConfig: unknown): bigint {
  if (typeof salaryConfig !== 'object' || salaryConfig === null) return 0n;
  const raw = (salaryConfig as { baseSalaryMinor?: unknown }).baseSalaryMinor;
  if (raw === undefined || raw === null) return 0n;
  try {
    const v = BigInt(raw as string | number);
    return v < 0n ? 0n : v;
  } catch {
    return 0n;
  }
}

/** Inclusive [start, endExclusive) UTC bounds for a "YYYY-MM" year-month. */
export function monthBounds(yearMonth: string): { start: Date; endExclusive: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`Noto'g'ri yearMonth format (YYYY-MM): ${yearMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) throw new Error(`Noto'g'ri oy: ${yearMonth}`);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, endExclusive };
}
