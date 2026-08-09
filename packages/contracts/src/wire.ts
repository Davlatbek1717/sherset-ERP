import { z } from 'zod';

/**
 * Wire primitives — how a Prisma column looks AFTER `JSON.stringify`.
 *
 * These exist because the contract describes the **HTTP response**, not the
 * Prisma row. Three project-wide serialisation rules turn one into the other,
 * and every one of them has bitten us before:
 *
 *  1. **BigInt → string.** `apps/api/src/main.ts:19` installs a global
 *     `BigInt.prototype.toJSON` that returns `this.toString()`. So every
 *     `BigInt` column (`openingCashMinor`, `salesSumMinor`, `buyPrice`, …)
 *     arrives as a decimal STRING, never a number. Typing it `number` on the
 *     FE compiles fine and then silently produces `NaN` in arithmetic.
 *  2. **Prisma.Decimal → string.** Decimal.js defines `toJSON`, so quantity
 *     columns arrive as strings too. This is deliberate — see the float→BigInt
 *     precision work (Faza 34): parsing them back into `number` is the bug.
 *  3. **DateTime → ISO-8601 string.**
 *
 * The schemas below are the only place these rules are written down, so a page
 * that adopts a contract cannot get them wrong by hand.
 */

/** A `BigInt` column on the wire: decimal digits, optional leading `-`. */
export const MinorAmount = z.string().regex(/^-?\d+$/, 'minor amount must be an integer string');

/** A `Prisma.Decimal` column on the wire (quantities): `"0"`, `"1.5"`, `"-0.001"`. */
export const DecimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'decimal must be a numeric string');

/** A `DateTime` column on the wire. */
export const IsoDateTime = z.string();

/** A `@db.Uuid` primary key on the wire. */
export const Uuid = z.string().uuid();
