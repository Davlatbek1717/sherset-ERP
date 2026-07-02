# @moysklad/money

Valyuta-aware, aniq (bigint) pul arithmetic uchun paket.

## Nima uchun

JavaScript'ning `Number` turi (IEEE 754 double) pul hisobida yetarli emas:
```js
0.1 + 0.2 === 0.30000000000000004 // ❌
```

Bu paket `bigint` asosidagi **minor-unit storage** va **valyuta-aware API** bilan bu muammoni hal qiladi.

## O'rnatish

```bash
pnpm add @moysklad/money
```

## Foydalanish

```ts
import { Money, ExchangeRate } from '@moysklad/money';

// Constructors
const price = Money.fromMajor('15 000,50', 'UZS'); // 1_500_050n minor
const qty = 3;
const subtotal = price.times(qty);                  // 4_501_500n minor = 45 015,00 so'm
const vat = subtotal.percent(0.12);                 // 5 401,80 so'm
const total = subtotal.plus(vat);                   // 50 416,80 so'm

// Comparison
total.greaterThan(price); // true
total.equals(Money.fromMajor('50416.80', 'UZS')); // true

// Format
total.format('uz'); // "50 416,80 so'm"
total.format('en'); // "50 416,80 so'm" (symbol still, grouping changes)

// Split (e.g., into installments)
const installments = total.split(3);
// [Money(16_805_60n), Money(16_805_60n), Money(16_805_60n)]
// Remainder distributed to first parts
installments.reduce((a, b) => a.plus(b)).equals(total); // true

// Currency conversion
const rate = ExchangeRate.fromRatio('USD', 'UZS', 12_450);
const usd = Money.fromMajor('100', 'USD');
const uzs = rate.convert(usd); // 1_245_000_00n minor = 1 245 000,00 so'm

// JSON roundtrip (for API)
const json = total.toJSON(); // { minor: "5041680", currency: "UZS" }
const restored = Money.fromJSON(json); // deep-equal to `total`
```

## API

### `Money`

| Method | Signature | Izoh |
|---|---|---|
| `Money.fromMinor(minor, currency)` | `(bigint, CurrencyCode) → Money` | |
| `Money.fromMajor(major, currency, rounding?)` | `(string\|number, CurrencyCode, RoundingMode?) → Money` | Qabul qiladi: "15 000,50", "15,000.50", "15000.50" |
| `Money.zero(currency)` | `(CurrencyCode) → Money` | |
| `plus(other)` | `Money → Money` | Same currency check |
| `minus(other)` | `Money → Money` | Same currency check |
| `times(factor)` | `number\|bigint → Money` | Integer only — `.percent` for ratios |
| `percent(ratio, rounding?)` | `number, RoundingMode? → Money` | VAT, discount |
| `split(parts)` | `number → Money[]` | Even distribution, remainder to first |
| `negate() / abs()` | `→ Money` | |
| `equals(other)` | `Money → boolean` | Same currency AND same minor |
| `greaterThan / lessThan / equals ...` | `Money → boolean` | |
| `isZero() / isPositive() / isNegative()` | `→ boolean` | |
| `toMinor()` | `→ bigint` | |
| `toMajor()` | `→ string` | "15000.50" (canonical) |
| `format(locale?)` | `('uz'\|'ru'\|'en') → string` | "15 000,50 so'm" |
| `toJSON() / Money.fromJSON(json)` | | `{ minor: string, currency: CurrencyCode }` |

### `ExchangeRate`

| Method | Signature | Izoh |
|---|---|---|
| `new ExchangeRate(from, to, multiplier, effectiveAt)` | | `multiplier` — bigint scaled by 10^9 |
| `ExchangeRate.fromRatio(from, to, ratio, at?)` | `(CurrencyCode, CurrencyCode, number, Date?) → ExchangeRate` | |
| `convert(money)` | `Money → Money` | |
| `inverse()` | `→ ExchangeRate` | |
| `toRatio()` | `→ number` | Approximate (display only) |
| `toJSON() / ExchangeRate.fromJSON(json)` | | |

### Rounding modes

- `half-even` (banker's, **default**) — 0.5 → nearest even (minimizes bias)
- `half-up` — 0.5 → up
- `half-down` — 0.5 → down
- `up` — har doim up (away from zero)
- `down` — har doim down (toward zero)
- `ceil` — matematik ceiling
- `floor` — matematik floor

## Cheklovlar

- **Valyuta ro'yxati statik** (10 ta asosiy). Qo'shimcha valyutalar uchun `CURRENCIES` ro'yxatini kengaytirish yoki DB-driven registry.
- **Cross-unit conversion** (JPY ↔ USD) — hozircha aynan mos birlik bo'lmagan valyutalar o'rtasida `convert()` faqat minor'larni ko'paytiradi. To'g'ri cross-unit math uchun kelajakda kengaytma.
- **Locale formatting** soddalashtirilgan (to'liq i18n uchun `Intl.NumberFormat`'ga ko'chish mumkin).

## Tests

```bash
pnpm --filter @moysklad/money test
```

Test turlarga:
- Construction (fromMajor parsing, rounding)
- Arithmetic (0.1 + 0.2, VAT, discount cascades, split)
- Comparison
- Formatting
- JSON roundtrip
- **Property-based** (fast-check): commutativity, associativity, identity, inverse

## Bog'liq hujjatlar

- [ADR-0004: Pul va decimal'larni boshqarish](../../docs/adr/0004-money-handling.md)
