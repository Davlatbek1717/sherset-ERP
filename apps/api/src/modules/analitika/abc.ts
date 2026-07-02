import type { Prisma } from '@moysklad/db';

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcItemInput {
  productId: string;
  /** Sales value over the window, in tiyin (BigInt-safe). */
  salesValue: Prisma.Decimal;
}

export interface AbcItemResult {
  productId: string;
  salesValue: string;
  share: number;
  cumulativeShare: number;
  class: AbcClass;
}

export interface AbcThresholds {
  aMax: number;
  bMax: number;
}

export interface AbcSummary {
  items: AbcItemResult[];
  totalValue: string;
  counts: { a: number; b: number; c: number };
}

const DEFAULT_THRESHOLDS: AbcThresholds = { aMax: 0.8, bMax: 0.95 };

export function classifyAbc(
  items: AbcItemInput[],
  thresholds: AbcThresholds = DEFAULT_THRESHOLDS,
): AbcSummary {
  if (items.length === 0) {
    return { items: [], totalValue: '0', counts: { a: 0, b: 0, c: 0 } };
  }

  let total = items[0]!.salesValue;
  for (let i = 1; i < items.length; i += 1) {
    total = total.plus(items[i]!.salesValue);
  }

  if (total.isZero()) {
    const result: AbcItemResult[] = items.map((it) => ({
      productId: it.productId,
      salesValue: '0',
      share: 0,
      cumulativeShare: 1,
      class: 'C' as const,
    }));
    return { items: result, totalValue: '0', counts: { a: 0, b: 0, c: result.length } };
  }

  const sorted = [...items].sort((a, b) => {
    const cmp = b.salesValue.comparedTo(a.salesValue);
    return cmp !== 0 ? cmp : a.productId.localeCompare(b.productId);
  });

  const totalNum = Number(total.toFixed(4));
  let cumulative = 0;
  let a = 0;
  let b = 0;
  let c = 0;

  const classified: AbcItemResult[] = sorted.map((it, idx) => {
    const valueNum = Number(it.salesValue.toFixed(4));
    const share = valueNum / totalNum;
    cumulative += share;

    // The top contributor is always A — a single-product inventory still has
    // a "most valuable" item, even if cumulative > aMax.
    let cls: AbcClass;
    if (idx === 0 || cumulative <= thresholds.aMax) {
      cls = 'A';
      a += 1;
    } else if (cumulative <= thresholds.bMax) {
      cls = 'B';
      b += 1;
    } else {
      cls = 'C';
      c += 1;
    }

    return {
      productId: it.productId,
      salesValue: it.salesValue.toFixed(2),
      share,
      cumulativeShare: cumulative,
      class: cls,
    };
  });

  return { items: classified, totalValue: total.toFixed(2), counts: { a, b, c } };
}

export const DEFAULT_INTERVALS: Record<AbcClass, number> = {
  A: 7,
  B: 14,
  C: 30,
};
