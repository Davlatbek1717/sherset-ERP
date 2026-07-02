import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';
import type { RateContext } from './cash-flow-consolidate.util.js';

export type { RateContext };

/**
 * Convert one document amount (in its own `code` currency, minor units) into
 * the account base currency. Identity for base-currency / zero amounts;
 * exact-BigInt conversion via the Currency rate otherwise. Unknown currency
 * ⇒ face value (recorded in `seen` so the caller can raise mixedCurrency) —
 * never silently dropped. Shared by every money report that consolidates a
 * single per-row amount (aging, sales-by-channel, …).
 */
export function consolidateToBase(
  amountMinor: bigint,
  code: string,
  ctx: RateContext,
  seen: Set<string>,
): bigint {
  const cur = code || ctx.baseCode;
  seen.add(cur);
  if (amountMinor === 0n || cur === ctx.baseCode) return amountMinor;
  const rate = ctx.rates.get(cur);
  return rate ? toBaseMinor(amountMinor, rate) : amountMinor;
}

/**
 * Minimal Prisma surface the loader needs — keeps the helper unit-testable
 * with a stub and decoupled from the full PrismaService.
 */
export interface CurrencyReader {
  currency: {
    findMany: (args: {
      where: { accountId: string };
      select: {
        code: true;
        default: true;
        rateValue: true;
        multiplicity: true;
        indirect: true;
      };
    }) => Promise<
      Array<{
        code: string;
        default: boolean;
        rateValue: bigint;
        multiplicity: number;
        indirect: boolean;
      }>
    >;
  };
}

/**
 * Load an account's currency rate context once: the base (валюта учёта) code
 * plus a `code → CurrencyRate` map for exact BigInt base-consolidation
 * (§Unit-C). Shared by every money report that aggregates across currencies
 * (cash-flow, aging, …) so the conversion contract is identical everywhere.
 *
 * A tenant with no Currency rows defaults to base 'UZS' with an empty map —
 * callers then treat every bucket as base (single-currency fast path).
 */
export async function loadRateContext(
  client: CurrencyReader,
  accountId: string,
): Promise<RateContext> {
  const curs = await client.currency.findMany({
    where: { accountId },
    select: { code: true, default: true, rateValue: true, multiplicity: true, indirect: true },
  });
  const rates = new Map<string, CurrencyRate>();
  let baseCode = 'UZS';
  for (const c of curs) {
    rates.set(c.code, {
      rateValue: c.rateValue,
      multiplicity: BigInt(c.multiplicity),
      indirect: c.indirect,
    });
    if (c.default) baseCode = c.code;
  }
  return { baseCode, rates };
}
