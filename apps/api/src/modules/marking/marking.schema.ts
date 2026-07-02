import { z } from 'zod';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

export const MarkingStatusSchema = z.enum([
  'allocated',
  'applied',
  'sold',
  'returned',
  'retired',
  'rejected',
]);
export type MarkingStatus = z.infer<typeof MarkingStatusSchema>;

const stir = z.string().regex(/^\d{9}$|^\d{14}$/);

export const SaveMarkingConfigSchema = z.object({
  stir,
  apiBaseUrl: z.string().url().max(255),
  apiToken: z.string().max(2000).optional(),
  testMode: z.coerce.boolean().default(true),
});
export type SaveMarkingConfigInput = z.infer<typeof SaveMarkingConfigSchema>;

/**
 * Single marking code allocation request — the operator scans/types a
 * code and we register it in our local ledger. Real allocation from
 * ASL Belgisi happens via the provider API; this records the fact for
 * traceability.
 */
export const AllocateCodeSchema = z.object({
  code: z.string().min(20).max(200),
  productId: uuid.nullish(),
  variantId: uuid.nullish(),
});
export type AllocateCodeInput = z.infer<typeof AllocateCodeSchema>;

export const ApplyCodeSchema = z.object({
  code: z.string().min(20).max(200),
  productId: uuid,
});
export type ApplyCodeInput = z.infer<typeof ApplyCodeSchema>;

export const MarkSoldSchema = z.object({
  code: z.string().min(20).max(200),
  sourceEntity: z.enum(['RetailDemand', 'Demand']),
  sourceEntityId: uuid,
});
export type MarkSoldInput = z.infer<typeof MarkSoldSchema>;

export const ListMarkingCodesSchema = z.object({
  status: MarkingStatusSchema.optional(),
  productId: uuid.optional(),
  gtin: optionalEmpty(20),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type ListMarkingCodesInput = z.infer<typeof ListMarkingCodesSchema>;

/**
 * Parse a GS1 DataMatrix code into its constituent fields. Format:
 *   01<GTIN-14>21<serial>91<crypto>92<crypto-tail>
 *
 * Real codes use FNC1 separators (0x1D) between AI groups; we accept
 * either FNC1 or no-separator form (some scanners strip them).
 */
export function parseGs1DataMatrix(raw: string): {
  gtin: string;
  serial: string;
  crypto?: string;
  cryptoTail?: string;
} {
  const fnc1 = String.fromCharCode(0x1d);
  // Strip any FNC1 separator chars; we'll re-discover boundaries by AI prefix.
  const stripped = raw.split(fnc1).join('');

  // AI 01 = GTIN (14 fixed digits)
  if (!stripped.startsWith('01') || stripped.length < 16) {
    throw new Error('Invalid DataMatrix: missing AI 01 GTIN');
  }
  const gtin = stripped.slice(2, 16);
  if (!/^\d{14}$/.test(gtin)) {
    throw new Error('Invalid DataMatrix: GTIN must be 14 digits');
  }

  // AI 21 = serial (variable, terminated by next AI or end)
  let rest = stripped.slice(16);
  if (!rest.startsWith('21')) {
    throw new Error('Invalid DataMatrix: missing AI 21 serial');
  }
  rest = rest.slice(2);
  // Serial runs until '91' or '92' or '93' AI marker, or end of string.
  const nextAiIdx = findNextAi(rest, ['91', '92', '93']);
  const serial = nextAiIdx === -1 ? rest : rest.slice(0, nextAiIdx);
  rest = nextAiIdx === -1 ? '' : rest.slice(nextAiIdx);

  let crypto: string | undefined;
  let cryptoTail: string | undefined;
  if (rest.startsWith('91')) {
    rest = rest.slice(2);
    const nextIdx = findNextAi(rest, ['92', '93']);
    crypto = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
    rest = nextIdx === -1 ? '' : rest.slice(nextIdx);
  }
  if (rest.startsWith('92')) {
    cryptoTail = rest.slice(2);
  }

  return { gtin, serial, crypto, cryptoTail };
}

function findNextAi(s: string, ais: string[]): number {
  for (let i = 1; i < s.length - 1; i++) {
    const window = s.slice(i, i + 2);
    if (ais.includes(window)) return i;
  }
  return -1;
}
