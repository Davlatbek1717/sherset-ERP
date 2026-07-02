# ADR-0004: Pul va decimal'larni boshqarish

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17

## Kontekst va muammo

ERP'ning eng kritik qismi — pul bilan ishlash:
- Narx, chegirma, KDV kaskadi, umumiy summa hisobi
- Ko'p valyuta (UZS, USD, RUB, EUR) + konversiya
- Precision: 1 tiyin ham muhim. 0.1 + 0.2 ≠ 0.3 bug'i **mumkin emas**

JavaScript'ning `Number` (IEEE 754 double-precision) — pul uchun to'g'ridan-to'g'ri ishlatilmaydi. Yechim — **integer tiyinda saqlash** + decimal kutubxona.

## Qarorning natijasi

### Saqlash (storage)
**Barcha pul summalari = `BigInt` / `int64` — eng kichik birlikda (tiyin).**

- UZS: 1 so'm = 100 tiyin
- USD: 1 dollar = 100 cent
- Precision: har valyuta uchun `currency.minorUnit` (metadata)
- DB turi: `BIGINT` (Prisma `BigInt`)
- Moysklad API ham shunday ishlaydi: `sum` maydoni integer (tiyin/kopek)

### Hisoblash (computation)
**`packages/money` paketi** — barcha arithmetic shu yerda:

```typescript
import { Money } from '@moysklad/money';

const price = Money.fromMinor(150_000n, 'UZS'); // 1500 so'm
const quantity = 3;
const vatRate = 0.12;

const subtotal = price.times(quantity);          // 4500 so'm
const vat = subtotal.percent(vatRate);           // 540 so'm
const total = subtotal.plus(vat);                // 5040 so'm

console.log(total.format()); // "5 040 so'm"
console.log(total.toMinor()); // 504_000n (tiyin)
```

### Decimal library
- **Asosiy:** o'z `Money` klasi (`BigInt` asosida, valyuta-aware)
- **Advanced:** `decimal.js-light` (faqat kerak bo'lsa, masalan percentage hisoblashda)
- **Hech qachon:** `Number`, `parseFloat`, `toFixed` (pul bilan)

### Valyuta konversiyasi
- Har hujjatda `rate: { currency: 'UZS', value: 1 }` (Moysklad API bilan mos)
- Multi-currency hujjatlarda: hujjat valyutasi + organization valyutasi + rate
- Kurs manbai: CBRU API (kundalik), keshlash (Redis)

## Sabab

### Nega integer tiyinda?
1. **Aniq.** Precision yo'qolishi mumkin emas (BigInt overflow 2^63-1 = 9.2 × 10^18 — Moon narxidan katta).
2. **Moysklad API shunday.** 1:1 klon uchun tabiiy mosligi.
3. **DB performance.** BIGINT — PostgreSQL'da tez indekslash, arithmetic CPU native.
4. **JSON serialization.** `BigInt` → string (JSON'da) — aniq yo'qotmaydi.

### Nega `BigDecimal` emas?
- JavaScript'da native `BigDecimal` yo'q (TC39 taklifi bor, lekin hali yetuk emas)
- `decimal.js` — sekin (per operation object allocation)
- Integer tiyin = 100x tez va 100% aniq, agar disciplined bo'lsa

### Nega class (Money) qo'limda o'rash?
- Compile-time type check (`Money` ≠ `number`)
- Valyuta aralashuvi xatosi (`UZS + USD` — compile error)
- API darajasida aniq format (serialize/deserialize)
- Amount + Currency bog'langan — har joyda yonida yurib

## Money paketi API

```typescript
// packages/money/src/index.ts

export class Money {
  constructor(
    readonly minor: bigint,    // tiyin
    readonly currency: Currency // 'UZS' | 'USD' | 'RUB' | 'EUR' | ...
  ) {}

  static fromMajor(major: number | string, currency: Currency): Money;
  static fromMinor(minor: bigint, currency: Currency): Money;
  static zero(currency: Currency): Money;

  plus(other: Money): Money;     // same currency check
  minus(other: Money): Money;
  times(n: number): Money;        // scale qty
  percent(p: number): Money;      // VAT, discount
  negate(): Money;
  abs(): Money;

  equals(other: Money): boolean;
  greaterThan(other: Money): boolean;
  lessThan(other: Money): boolean;

  toMinor(): bigint;
  toMajor(): string;              // "15 420,00"
  format(locale?: string): string;// "15 420,00 so'm"

  toJSON(): { minor: string; currency: Currency };
  static fromJSON(json): Money;
}

export class ExchangeRate {
  constructor(
    readonly from: Currency,
    readonly to: Currency,
    readonly multiplier: bigint, // scaled by 10^9 for precision
    readonly effectiveAt: Date
  ) {}

  convert(money: Money): Money;
}
```

## Test strategiyasi (kritik)

- **Property-based tests** (fast-check): har arithmetic operation kommutativ, assotsiativ, tarqaladi
- **0.1 + 0.2 testi:** `Money(100_000n) + Money(200_000n) === Money(300_000n)` har vaqt
- **Cascading VAT:** `price.times(qty).discount(10%).vat(12%)` — precision tekshiruv
- **Currency mismatch:** `UZS.plus(USD)` → compile error (type system) AND runtime error
- **Round-trip:** `Money.fromJSON(m.toJSON()).equals(m)` — idempotent

## Moysklad API mosligi

```typescript
// API'dan keladigan ma'lumot:
// { sum: 1500000, rate: { currency: { meta: { ... } }, value: 1 } }

function fromMoyskladApi(dto: { sum: number; rate: { value: number; currency: { ... } } }): Money {
  const currency = resolveCurrency(dto.rate.currency);
  return Money.fromMinor(BigInt(dto.sum), currency);
}
```

## Oqibatlari

### Ijobiy
- Floating-point xatolari yo'q
- Code review oson (compile-time check)
- Valyuta aralashuvi xatolari yopiq
- Performance yaxshi (BigInt native)

### Salbiy / cheklovlar
- Har joyda `Money`'ga o'ralishi kerak — **yumshatiladi:** ORM model'ni override qilib, DB'dan chiqishda Money class'ga auto-convert
- Discount kaskadida kichik yaxlitlash masalalari bo'lishi mumkin — **yumshatiladi:** explicit rounding strategy (banker's rounding default), hujjat matnida ko'rsatiladi

### Neytral
- `BigInt` JSON'da string bo'lib qaytadi (native) — o'rnatilgan
- Frontend ham Money klasini ishlatadi — type share

## Bog'liq hujjatlar

- [packages/money/README.md](../../packages/money/README.md)
- [Moysklad API — Положения и цены](https://dev.moysklad.ru/doc/api/remap/1.2/)
- [EcmaScript BigInt proposal](https://github.com/tc39/proposal-bigint)
