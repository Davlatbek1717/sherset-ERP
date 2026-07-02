/**
 * Pure position-combining for the document «Объединить» (merge) feature —
 * shared by purchase-order and customer-order (both have identically-shaped
 * positions). Combines the positions of N source documents into one list:
 * lines that are IDENTICAL in (assortmentKind, assortmentId, priceMinor,
 * discount, vat, vatEnabled) are SUMMED (quantities added); any difference
 * keeps them as separate lines, so price / discount / VAT information is never
 * silently lost. The first-seen order of distinct lines is preserved.
 *
 * Quantity is aggregated in integer micro-units (Decimal(20,6) → ×1e6) — never
 * floats — to avoid the 0.1 + 0.2 drift the global money rules warn about.
 *
 * Kept as a pure, prisma-free function so the risky grouping/summing logic is
 * unit-tested directly; each service orchestrates the DB create around it.
 */

export interface MergeSourcePosition {
  assortmentKind: string;
  assortmentId: string;
  productId: string | null;
  /** Prisma.Decimal | string | number — stringified internally. */
  quantity: unknown;
  priceMinor: bigint;
  /** Prisma.Decimal | string | number — stringified internally. */
  discount: unknown;
  vat: number | null;
  vatEnabled: boolean;
}

export interface CombinedPosition {
  assortmentKind: string;
  assortmentId: string;
  productId: string | null;
  quantity: string;
  priceMinor: bigint;
  discount: string;
  vat: number | null;
  vatEnabled: boolean;
}

/** Decimal(20,6) → integer micro-unit scale. */
const QTY_SCALE = 1_000_000n;
const QTY_FRACTION_DIGITS = 6;

/** Parse a decimal quantity into integer micro-units (×1e6). Float-free. */
export function quantityToMicro(value: unknown): bigint {
  const raw = String(value).trim();
  if (raw === '' || raw === 'null' || raw === 'undefined') return 0n;
  const neg = raw.startsWith('-');
  const s = neg ? raw.slice(1) : raw;
  const [intPart = '0', fracPart = ''] = s.split('.');
  const frac = (fracPart + '0'.repeat(QTY_FRACTION_DIGITS)).slice(0, QTY_FRACTION_DIGITS);
  const micro = BigInt(intPart || '0') * QTY_SCALE + BigInt(frac || '0');
  return neg ? -micro : micro;
}

/** Format integer micro-units back to a trimmed decimal string. */
export function microToQuantity(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const intPart = (abs / QTY_SCALE).toString();
  const fracDigits = (abs % QTY_SCALE)
    .toString()
    .padStart(QTY_FRACTION_DIGITS, '0')
    .replace(/0+$/, '');
  const out = fracDigits ? `${intPart}.${fracDigits}` : intPart;
  return neg ? `-${out}` : out;
}

export function combineMergePositions(
  sources: ReadonlyArray<{ positions: ReadonlyArray<MergeSourcePosition> }>,
): CombinedPosition[] {
  const groups = new Map<string, { pos: CombinedPosition; micro: bigint }>();
  const firstSeen: string[] = [];

  for (const src of sources) {
    for (const p of src.positions) {
      const discount = String(p.discount ?? '0');
      const key = [
        p.assortmentKind,
        p.assortmentId,
        p.priceMinor.toString(),
        discount,
        p.vat ?? '',
        p.vatEnabled,
      ].join('|');
      const micro = quantityToMicro(p.quantity);
      const existing = groups.get(key);
      if (existing) {
        existing.micro += micro;
      } else {
        groups.set(key, {
          micro,
          pos: {
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            productId: p.productId,
            quantity: '0', // finalized from `micro` below
            priceMinor: p.priceMinor,
            discount,
            vat: p.vat,
            vatEnabled: p.vatEnabled,
          },
        });
        firstSeen.push(key);
      }
    }
  }

  return firstSeen.map((key) => {
    const group = groups.get(key) as { pos: CombinedPosition; micro: bigint };
    return { ...group.pos, quantity: microToQuantity(group.micro) };
  });
}
