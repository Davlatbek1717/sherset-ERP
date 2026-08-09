import { alphaCurrencyCode } from '../currency/currency-code.util.js';
import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';

/**
 * An account's currency rate context: the base (валюта учёта) code plus the
 * current `code → CurrencyRate` map. Owned here (the loader's module) and
 * re-exported by `cash-flow-consolidate.util.ts` for its own consumers.
 */
export interface RateContext {
  baseCode: string;
  rates: Map<string, CurrencyRate>;
}

/** Identity rate — `rateValue` scale is ×10^8 (DB-01, Faza 16). */
const IDENTITY_RATE = 100_000_000n;

/**
 * Money a report could NOT consolidate into the account base, kept in its own
 * currency. Reported alongside the base totals as the «konvertatsiya
 * qilinmagan» line (M-12) instead of being folded in at face value.
 */
export interface UnconvertedAmount {
  currency: string;
  /** BigInt-as-string, minor units of `currency` (NOT of the base). */
  amountMinor: string;
}

/**
 * Accumulator threaded through a report's consolidation pass. Replaces the
 * bare `Set<string>` that only tracked "which currencies did we see" — it
 * keeps the same `add`/`size` surface, plus the money that could NOT be
 * consolidated (M-12).
 *
 * Faza 17 / M-12: a currency with no Currency row used to be added to the
 * base total at FACE VALUE — USD 1 000.00 landed in a UZS total as 1 000
 * so'm (~12 000× understated) and the number still looked plausible. It is
 * now excluded from the total and accumulated here instead, so the caller
 * reports it as a separate «konvertatsiya qilinmagan» line. Money is never
 * silently dropped: it is either converted or listed.
 */
export class CurrencyTally {
  private readonly codes = new Set<string>();
  private readonly unconverted = new Map<string, bigint>();

  /** Record an encountered currency (Set-compatible). */
  add(code: string): void {
    this.codes.add(code);
  }

  /** Distinct currencies encountered (Set-compatible). */
  get size(): number {
    return this.codes.size;
  }

  /** Was this currency encountered? (Set-compatible.) */
  has(code: string): boolean {
    return this.codes.has(code);
  }

  /** True when the scope spans more than one currency (`mixedCurrency`). */
  get mixed(): boolean {
    return this.codes.size > 1;
  }

  /** True when some amount could not be consolidated into the base. */
  get hasUnconverted(): boolean {
    return this.unconverted.size > 0;
  }

  /** Add an amount that could not be converted, in its own currency. */
  addUnconverted(code: string, amountMinor: bigint): void {
    this.unconverted.set(code, (this.unconverted.get(code) ?? 0n) + amountMinor);
  }

  /**
   * The unconverted money, per currency, in first-seen order — the shape
   * every report puts in its `unconvertedByCurrency` response field.
   */
  unconvertedRows(): UnconvertedAmount[] {
    return Array.from(this.unconverted, ([currency, amountMinor]) => ({
      currency,
      amountMinor: amountMinor.toString(),
    }));
  }
}

/**
 * Resolve the rate to consolidate a `code`-currency amount with.
 *
 * M-11 (Faza 17): reports must value a historical document at the rate the
 * document itself carries (`rate_value`, ×10^8) — otherwise every past
 * period is restated whenever the Currency table moves, which contradicts
 * the transaction-date-rate accounting rule.
 *
 * `docRateValue === IDENTITY_RATE` on a NON-base currency is NOT a usable
 * historical rate: `rateValue` is `@default(100000000)` in the schema, so a
 * foreign-currency document whose rate was never filled in also reads 1e8.
 * Trusting it blindly would reintroduce the face-value bug (M-12 class)
 * through another door — so identity falls back to the current context rate.
 * This also makes the change byte-for-byte neutral for existing rows (all of
 * which carry the default) rather than silently restating history.
 */
function resolveRate(
  cur: string,
  ctx: RateContext,
  docRateValue?: bigint,
): CurrencyRate | undefined {
  if (docRateValue !== undefined && docRateValue > 0n && docRateValue !== IDENTITY_RATE) {
    return { rateValue: docRateValue, multiplicity: 1n, indirect: false };
  }
  return ctx.rates.get(cur);
}

/**
 * Convert one document amount (in its own `code` currency, minor units) into
 * the account base currency. Identity for base-currency / zero amounts;
 * exact-BigInt conversion otherwise, preferring the document's own historical
 * rate (`docRateValue`, M-11) over the current Currency rate. A currency with
 * neither rate is NOT added to the total — it lands in `tally` as unconverted
 * (M-12) and the caller surfaces it. Shared by every money report that
 * consolidates a single per-row amount (aging, sales-by-channel, …).
 */
export function consolidateToBase(
  amountMinor: bigint,
  code: string,
  ctx: RateContext,
  tally: CurrencyTally,
  docRateValue?: bigint,
): bigint {
  const cur = code || ctx.baseCode;
  tally.add(cur);
  if (amountMinor === 0n || cur === ctx.baseCode) return amountMinor;
  const rate = resolveRate(cur, ctx, docRateValue);
  if (!rate) {
    tally.addUnconverted(cur, amountMinor);
    return 0n;
  }
  return toBaseMinor(amountMinor, rate);
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
        isoCode: true;
        default: true;
        rateValue: true;
        multiplicity: true;
        indirect: true;
      };
    }) => Promise<
      Array<{
        code: string;
        isoCode: string | null;
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
 * M-03 (Faza 16): documents store the ALPHA code ('UZS'/'USD') in their
 * `currency` column, while Currency.code is ISO NUMERIC ('860') under the
 * moysklad convention (legacy rows may still be alpha-in-code). The map is
 * therefore keyed by the row's resolved ALPHA code — plus the raw `code` as
 * a defensive extra key — so a lookup by document currency always hits.
 * Before this, baseCode='860' ≠ 'UZS' pushed EVERY conversion into the
 * face-value fallback (~12 000× error on USD rows).
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
    select: {
      code: true,
      isoCode: true,
      default: true,
      rateValue: true,
      multiplicity: true,
      indirect: true,
    },
  });
  const rates = new Map<string, CurrencyRate>();
  let baseCode = 'UZS';
  for (const c of curs) {
    const rate: CurrencyRate = {
      rateValue: c.rateValue,
      multiplicity: BigInt(c.multiplicity),
      indirect: c.indirect,
    };
    const alpha = alphaCurrencyCode(c);
    if (alpha) rates.set(alpha, rate);
    // Numeric (yoki boshqa) `code` ham kalit bo'lib qoladi — qaysi
    // konventsiyadagi hujjat kelsa ham xarita topadi.
    if (!rates.has(c.code)) rates.set(c.code, rate);
    if (c.default) baseCode = alpha ?? c.code;
  }
  return { baseCode, rates };
}
