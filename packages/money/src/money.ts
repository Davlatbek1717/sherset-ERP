import { type CurrencyCode, type CurrencyMeta, getCurrency, isCurrencyCode } from './currencies.js';

/**
 * Money — valyuta-aware, aniq (bigint) pul qiymati.
 *
 * Saqlanadi: minor birlikda (tiyin, cent) — `bigint`.
 * Hisoblanadi: `bigint` arithmetic.
 *
 * API:
 *   const price = Money.fromMajor('15 000,50', 'UZS'); // 1 500 050 tiyin
 *   const total = price.times(3).percent(0.12);
 *   price.format(); // "15 000,50 so'm"
 *
 * Invariantlar:
 *   - Currency mismatch → runtime error
 *   - Integer arithmetic (yaxlitlash explicit RoundingMode bilan)
 *   - JSON serializer aniq roundtrip ({ minor: string, currency: 'UZS' })
 */

export type RoundingMode = 'half-even' | 'half-up' | 'half-down' | 'up' | 'down' | 'ceil' | 'floor';

export interface MoneyJSON {
  minor: string; // bigint serialized
  currency: CurrencyCode;
}

export class Money {
  public readonly minor: bigint;
  public readonly currency: CurrencyMeta;

  private constructor(minor: bigint, currency: CurrencyMeta) {
    if (typeof minor !== 'bigint') {
      throw new TypeError(`Money.minor must be bigint, got ${typeof minor}`);
    }
    this.minor = minor;
    this.currency = currency;
  }

  // ─── constructors ─────────────────────────────────────────

  static fromMinor(minor: bigint | number, currency: CurrencyCode): Money {
    const m = typeof minor === 'bigint' ? minor : BigInt(Math.trunc(minor));
    return new Money(m, getCurrency(currency));
  }

  static fromMajor(
    major: string | number,
    currency: CurrencyCode,
    rounding: RoundingMode = 'half-even',
  ): Money {
    const meta = getCurrency(currency);
    const asString = typeof major === 'number' ? major.toString() : major;
    // Accept "15 000,50" or "15000.50" or "15,000.50" — canonicalize to "15000.50"
    const normalized = canonicalizeNumberString(asString);
    return new Money(parseToMinor(normalized, meta, rounding), meta);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, getCurrency(currency));
  }

  // ─── arithmetic ───────────────────────────────────────────

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  /** Scale by integer (quantity). Use `percent` for ratios. */
  times(factor: number | bigint): Money {
    if (typeof factor === 'bigint') {
      return new Money(this.minor * factor, this.currency);
    }
    if (!Number.isInteger(factor)) {
      throw new Error('Money.times(factor) must be integer or bigint. Use .percent for ratios.');
    }
    return new Money(this.minor * BigInt(factor), this.currency);
  }

  /** Apply a ratio (e.g., 0.12 for 12% VAT). Uses banker's rounding by default. */
  percent(ratio: number, rounding: RoundingMode = 'half-even'): Money {
    if (!Number.isFinite(ratio)) {
      throw new Error(`Money.percent(ratio) requires finite number, got ${ratio}`);
    }
    // Represent ratio as numerator/10^9 to preserve precision
    const scale = 1_000_000_000n;
    const numerator = BigInt(Math.round(ratio * 1_000_000_000));
    return new Money(divideRound(this.minor * numerator, scale, rounding), this.currency);
  }

  /** Split into N equal parts, distributing remainder to first parts (avoids cent loss). */
  split(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new Error(`Money.split(parts) requires positive integer, got ${parts}`);
    }
    const base = this.minor / BigInt(parts);
    const remainder = this.minor % BigInt(parts);
    const result: Money[] = [];
    for (let i = 0; i < parts; i++) {
      const extra = BigInt(i) < remainder ? 1n : 0n;
      result.push(new Money(base + extra, this.currency));
    }
    return result;
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  abs(): Money {
    return new Money(this.minor < 0n ? -this.minor : this.minor, this.currency);
  }

  // ─── comparison ───────────────────────────────────────────

  equals(other: Money): boolean {
    return this.currency.code === other.currency.code && this.minor === other.minor;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor > other.minor;
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor >= other.minor;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor < other.minor;
  }

  lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor <= other.minor;
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  isPositive(): boolean {
    return this.minor > 0n;
  }

  isNegative(): boolean {
    return this.minor < 0n;
  }

  // ─── serialization ────────────────────────────────────────

  toMinor(): bigint {
    return this.minor;
  }

  /** Returns the major-unit representation as a decimal string ("15000.50"). */
  toMajor(): string {
    const { multiplier, minorUnit } = this.currency;
    const negative = this.minor < 0n;
    const abs = negative ? -this.minor : this.minor;
    const whole = abs / multiplier;
    const fraction = abs % multiplier;
    if (minorUnit === 0) {
      return `${negative ? '-' : ''}${whole}`;
    }
    const fractionStr = fraction.toString().padStart(minorUnit, '0');
    return `${negative ? '-' : ''}${whole}.${fractionStr}`;
  }

  /** Human-readable formatted string: "15 000,50 so'm" (UZ), "$15,000.50" (US). */
  format(locale: 'uz' | 'ru' | 'en' = 'uz'): string {
    const major = this.toMajor();
    const [whole, fraction] = major.split('.');
    if (!whole) {
      return major;
    }
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'en' ? ',' : ' ');
    const decimalSep = locale === 'en' ? '.' : ',';
    const formatted = fraction ? `${grouped}${decimalSep}${fraction}` : grouped;
    const { symbol } = this.currency;
    // UZ convention: "1 500 so'm" (suffix); EN: "$1,500.00" (prefix for $, £)
    if (locale === 'uz' || locale === 'ru' || this.currency.code === 'UZS') {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  }

  toJSON(): MoneyJSON {
    return { minor: this.minor.toString(), currency: this.currency.code };
  }

  static fromJSON(json: MoneyJSON | { minor: string; currency: string }): Money {
    if (!isCurrencyCode(json.currency)) {
      throw new Error(`Invalid currency in Money JSON: ${json.currency}`);
    }
    return new Money(BigInt(json.minor), getCurrency(json.currency));
  }

  toString(): string {
    return this.format();
  }

  // ─── internals ────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency.code !== other.currency.code) {
      throw new Error(
        `Currency mismatch: ${this.currency.code} vs ${other.currency.code}. Use ExchangeRate.convert() first.`,
      );
    }
  }
}

// ─── helpers ───────────────────────────────────────────────

function canonicalizeNumberString(input: string): string {
  // Remove spaces; "15 000,50" → "15000,50"
  let s = input.replace(/\s/g, '').trim();
  // If both "," and ".", last one is decimal separator; the other is grouping
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // "15.000,50" → "15000.50"
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // "15,000.50" → "15000.50"
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // "15000,50" → "15000.50"
    s = s.replace(',', '.');
  }
  return s;
}

function parseToMinor(canonical: string, meta: CurrencyMeta, rounding: RoundingMode): bigint {
  const negative = canonical.startsWith('-');
  const abs = negative ? canonical.slice(1) : canonical;
  const [whole, fraction = ''] = abs.split('.');
  if (!whole || !/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new Error(`Money.fromMajor: invalid number "${canonical}"`);
  }
  const { minorUnit, multiplier } = meta;
  const fractionPadded = fraction.padEnd(minorUnit + 1, '0'); // +1 for rounding digit
  const keep = fractionPadded.slice(0, minorUnit);
  const next = fractionPadded.slice(minorUnit, minorUnit + 1);
  const rest = fractionPadded.slice(minorUnit + 1);
  let minor = BigInt(whole) * multiplier + BigInt(keep || '0');
  // Rounding
  const nextDigit = next ? Number(next) : 0;
  const restNonZero = rest.length > 0 && /[1-9]/.test(rest);
  const shouldRoundUp = applyRounding(minor, nextDigit, restNonZero, rounding);
  if (shouldRoundUp) {
    minor += 1n;
  }
  return negative ? -minor : minor;
}

function divideRound(numerator: bigint, denominator: bigint, rounding: RoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) {
    return quotient;
  }
  // Next digit is approximately (remainder*10)/denominator — we only need the direction
  const doubled = remainder * 2n;
  const negative = numerator < 0n !== denominator < 0n;
  const absDoubled = doubled < 0n ? -doubled : doubled;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const halfCompare = absDoubled === absDenominator ? 0 : absDoubled < absDenominator ? -1 : 1;
  const nextDigit = halfCompare < 0 ? 0 : halfCompare === 0 ? 5 : 9;
  const restNonZero = halfCompare !== 0;
  const shouldRoundUp = applyRounding(quotient, nextDigit, restNonZero, rounding);
  const base = quotient;
  const bump = shouldRoundUp ? (negative ? -1n : 1n) : 0n;
  return base + bump;
}

function applyRounding(
  current: bigint,
  nextDigit: number,
  restNonZero: boolean,
  mode: RoundingMode,
): boolean {
  const isEven = current % 2n === 0n;
  switch (mode) {
    case 'floor':
      return false;
    case 'ceil':
      return nextDigit > 0 || restNonZero;
    case 'up':
      return nextDigit > 0 || restNonZero;
    case 'down':
      return false;
    case 'half-up':
      return nextDigit >= 5;
    case 'half-down':
      return nextDigit > 5 || (nextDigit === 5 && restNonZero);
    case 'half-even':
      if (nextDigit < 5) return false;
      if (nextDigit > 5) return true;
      if (restNonZero) return true;
      return !isEven;
  }
}
