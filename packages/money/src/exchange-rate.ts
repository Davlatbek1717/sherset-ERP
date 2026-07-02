import type { CurrencyCode } from './currencies.js';
import { Money } from './money.js';

/**
 * ExchangeRate — valyuta konversiyasi. Moysklad API'dagi `rate` obyektini mapping qiladi.
 *
 * Rate precision: multiplier scaled by 10^9 (nano-precision).
 * Example: 1 USD = 12 450,27 UZS → multiplier = 12_450_270_000_000n (12450.27 * 10^9)
 */

const SCALE = 1_000_000_000n; // 10^9

export interface ExchangeRateJSON {
  from: CurrencyCode;
  to: CurrencyCode;
  multiplier: string; // bigint serialized
  effectiveAt: string; // ISO 8601
}

export class ExchangeRate {
  constructor(
    public readonly from: CurrencyCode,
    public readonly to: CurrencyCode,
    /** Scaled multiplier (multiplier / 10^9 = real ratio) */
    public readonly multiplier: bigint,
    public readonly effectiveAt: Date,
  ) {
    if (multiplier <= 0n) {
      throw new Error('ExchangeRate.multiplier must be positive');
    }
  }

  static fromRatio(
    from: CurrencyCode,
    to: CurrencyCode,
    ratio: number,
    at: Date = new Date(),
  ): ExchangeRate {
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new Error(`ExchangeRate.fromRatio: ratio must be positive finite, got ${ratio}`);
    }
    const multiplier = BigInt(Math.round(ratio * 1_000_000_000));
    return new ExchangeRate(from, to, multiplier, at);
  }

  convert(money: Money): Money {
    if (money.currency.code !== this.from) {
      throw new Error(
        `ExchangeRate.convert: money is ${money.currency.code}, expected ${this.from}`,
      );
    }
    // minor_out = minor_in * multiplier / 10^9
    // NOTE: cross-unit differences (e.g. JPY minor=0, USD minor=2) are assumed
    // pre-reconciled by the caller; this operates on minor units directly.
    const converted = (money.minor * this.multiplier) / SCALE;
    return Money.fromMinor(converted, this.to);
  }

  inverse(): ExchangeRate {
    const inverseMultiplier = (SCALE * SCALE) / this.multiplier;
    return new ExchangeRate(this.to, this.from, inverseMultiplier, this.effectiveAt);
  }

  toJSON(): ExchangeRateJSON {
    return {
      from: this.from,
      to: this.to,
      multiplier: this.multiplier.toString(),
      effectiveAt: this.effectiveAt.toISOString(),
    };
  }

  static fromJSON(json: ExchangeRateJSON): ExchangeRate {
    return new ExchangeRate(
      json.from,
      json.to,
      BigInt(json.multiplier),
      new Date(json.effectiveAt),
    );
  }

  /** Approximate ratio as number (for display; avoid in arithmetic). */
  toRatio(): number {
    return Number(this.multiplier) / 1_000_000_000;
  }
}
