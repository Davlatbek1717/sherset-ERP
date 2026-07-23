import { z } from 'zod';

/**
 * «Раскрой» (cutting meter-goods) — schema + pure math.
 *
 * A meter-good (труба 4м) is stocked in pieces («шт»); cutting one piece
 * produces shorter remnant pieces («отрез 2м») that must stay visible as
 * their own stock rows. The operation consumes N source pieces (Списание)
 * and books the resulting remnant pieces (Оприходование) atomically — see
 * product-cut.service.ts. This module holds everything DB-free so the
 * arithmetic is unit-testable: length parsing (exact integer millimeters,
 * no float drift), the length budget validation, and the cost split.
 *
 * Cost model: the consumed pieces' full weighted-average cost leaves stock
 * with the Loss; only the USED share (Σ piece lengths ÷ length budget)
 * re-enters with the remnants. The unused share — sawdust/offcut waste —
 * stays expensed on the Loss, which is exactly what a «Списание» is for.
 */

// Length in meters: up to 3 decimals (millimeter precision), > 0.
const lengthString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d{1,5}(\.\d{1,3})?$/, 'Uzunlik: metr, maksimal 3 kasr (masalan 2.5)'));

export const CutPieceSchema = z.object({
  lengthM: lengthString,
  quantity: z.number().int().min(1).max(10000),
  cellId: z.string().uuid().nullish(),
});

export const CutRequestSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  /** How many whole source pieces are being cut up. */
  consumedQty: z.number().int().min(1).max(10000),
  /** Length of ONE source piece, meters (e.g. "4"). Saved back to the product. */
  sourceLengthM: lengthString,
  /** Cell the source pieces are taken from (keeps StockByCell truthful). */
  sourceCellId: z.string().uuid().nullish(),
  pieces: z.array(CutPieceSchema).min(1).max(50),
  description: z.string().max(1000).nullish(),
});
export type CutRequestInput = z.infer<typeof CutRequestSchema>;

/** "2.500" | "2.5" | 2.5 → exact integer millimeters (no floats anywhere). */
export function lengthToMm(lengthM: string | number): bigint {
  const s = String(lengthM).trim();
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole || '0') * 1000n + BigInt(frac.padEnd(3, '0').slice(0, 3) || '0');
}

/** Integer millimeters → canonical meters string ("2500" → "2.5", "2000" → "2"). */
export function mmToLength(mm: bigint): string {
  const whole = mm / 1000n;
  const frac = (mm % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Canonical form used as the remnant's attribute key ("2.50" → "2.5"). */
export function normalizeLengthM(lengthM: string | number): string {
  return mmToLength(lengthToMm(lengthM));
}

/** Remnant product display name — «Труба 4м — отрез 2.5м». */
export function remnantName(rootName: string, lengthM: string): string {
  return `${rootName} — отрез ${lengthM}м`;
}

export interface CutBudget {
  budgetMm: bigint;
  usedMm: bigint;
  wasteMm: bigint;
}

/**
 * Validate the length budget: every piece must fit inside ONE source piece
 * (you cannot weld two offcuts together), and the total cut length cannot
 * exceed consumedQty × sourceLength. The shortfall is waste (kerf, stub).
 * Throws Error with a user-facing message on violation.
 */
export function validateCutBudget(
  sourceLengthM: string,
  consumedQty: number,
  pieces: Array<{ lengthM: string; quantity: number }>,
): CutBudget {
  const srcMm = lengthToMm(sourceLengthM);
  if (srcMm <= 0n) throw new Error("Uzunlik 0 bo'lishi mumkin emas");
  const budgetMm = srcMm * BigInt(consumedQty);
  let usedMm = 0n;
  for (const p of pieces) {
    const mm = lengthToMm(p.lengthM);
    if (mm <= 0n) throw new Error("Bo'lak uzunligi 0 bo'lishi mumkin emas");
    // Strictly shorter: a "piece" equal to the source is not a cut at all.
    if (mm >= srcMm) {
      throw new Error(
        `Bo'lak (${mmToLength(mm)}м) manba uzunligidan (${mmToLength(srcMm)}м) qisqa bo'lishi kerak`,
      );
    }
    usedMm += mm * BigInt(p.quantity);
  }
  if (usedMm > budgetMm) {
    throw new Error(
      `Bo'laklar jami ${mmToLength(usedMm)}м — mavjud ${mmToLength(budgetMm)}м dan ko'p`,
    );
  }
  return { budgetMm, usedMm, wasteMm: budgetMm - usedMm };
}

export interface CutCostSplit {
  /** Line totals (minor units), index-aligned with the pieces argument. */
  lineShares: bigint[];
  /** Σ lineShares — the value that re-enters stock with the remnants. */
  usedMinor: bigint;
  /** totalMinor − usedMinor — waste value, stays expensed on the Loss. */
  wasteMinor: bigint;
}

/**
 * Split the consumed cost across the piece rows proportionally to
 * lengthM × quantity, denominated over the FULL length budget — so the
 * unused (waste) share is simply never re-entered. Exact bigint math:
 * every row floors, the last row absorbs the used-total's rounding dust,
 * so Σ lineShares === usedMinor to the minor unit (ledger stays zero-drift).
 */
export function distributeCutCost(
  totalMinor: bigint,
  budgetMm: bigint,
  pieces: Array<{ lengthM: string; quantity: number }>,
): CutCostSplit {
  if (budgetMm <= 0n) return { lineShares: pieces.map(() => 0n), usedMinor: 0n, wasteMinor: 0n };
  const weights = pieces.map((p) => lengthToMm(p.lengthM) * BigInt(p.quantity));
  const usedMm = weights.reduce((a, b) => a + b, 0n);
  // Round-half-up of total × used / budget.
  const usedMinor = (totalMinor * usedMm * 2n + budgetMm) / (budgetMm * 2n);
  const lineShares = weights.map((w) => (totalMinor * w) / budgetMm);
  const allocated = lineShares.reduce((a, b) => a + b, 0n);
  const last = lineShares.length - 1;
  lineShares[last] = (lineShares[last] ?? 0n) + (usedMinor - allocated);
  return { lineShares, usedMinor, wasteMinor: totalMinor - usedMinor };
}

/** Prorate a per-piece money amount by length (round half-up): 4м price → 2.5м price. */
export function prorateMinorByLength(baseMinor: bigint, pieceMm: bigint, sourceMm: bigint): bigint {
  if (sourceMm <= 0n) return 0n;
  return (baseMinor * pieceMm * 2n + sourceMm) / (sourceMm * 2n);
}
