import { describe, expect, it } from 'vitest';
import {
  BulkUpdateSchema,
  CreateProductSchema,
  ProductFilterSchema,
  SetSalePriceSchema,
  UpdateProductSchema,
} from './product.schema.js';

/**
 * Guards the Phase-2 "edit a product → 400" bug-class.
 *
 * The catalog EDIT forms (products / services / bundles all PATCH /products,
 * variants PATCH /variants) send the full object and serialize an empty
 * optional field as explicit `null` to CLEAR it, while the CREATE forms omit
 * empties (`undefined`). The schema's optional fields must therefore be
 * `.nullish()` (accept null AND undefined) — the columns are nullable and the
 * repository writes null → clears the field. `.optional()` alone rejects null
 * ("Expected string, received null") → every product edit with an empty
 * optional field 400'd. This is a runtime-only contract invisible to
 * typecheck / lint / the i18n gate, so it needs a real schema test.
 */
describe('UpdateProductSchema null-clear (edit form PATCHes null to clear optional fields)', () => {
  it('accepts null for every field the edit forms can clear', () => {
    const r = UpdateProductSchema.safeParse({
      name: 'Valid name',
      version: 1,
      code: null,
      externalCode: null,
      article: null,
      description: null,
      country: null,
      productFolderId: null,
      supplierId: null,
      buyPrice: null,
      minPrice: null,
      buyPriceCurrency: null,
      minPriceCurrency: null,
      weightG: null,
      volumeML: null,
      uom: null, // the service edit form uniquely sends uom: null
      paymentItemType: null,
      mxikCode: null,
      vat: null,
    });
    if (!r.success) throw r.error;
    expect(r.data.article).toBeNull();
    expect(r.data.uom).toBeNull();
    expect(r.data.paymentItemType).toBeNull();
    expect(r.data.mxikCode).toBeNull();
  });

  it('still rejects null for name (NOT NULL column — must not be widened)', () => {
    expect(UpdateProductSchema.safeParse({ name: null, version: 1 }).success).toBe(false);
  });

  it('accepts a 3-letter buy/min price currency and rejects other lengths', () => {
    const ok = CreateProductSchema.safeParse({
      name: 'X',
      buyPrice: '1000',
      buyPriceCurrency: 'USD',
      minPriceCurrency: 'EUR',
    });
    if (!ok.success) throw ok.error;
    expect(ok.data.buyPriceCurrency).toBe('USD');
    expect(ok.data.minPriceCurrency).toBe('EUR');
    // 2- or 4-letter codes are rejected (length(3) guard).
    expect(CreateProductSchema.safeParse({ name: 'X', buyPriceCurrency: 'US' }).success).toBe(
      false,
    );
    expect(CreateProductSchema.safeParse({ name: 'X', buyPriceCurrency: 'USDD' }).success).toBe(
      false,
    );
  });

  it('still rejects null for minimumBalanceMinor (non-nullable, defaults to 0)', () => {
    expect(UpdateProductSchema.safeParse({ minimumBalanceMinor: null, version: 1 }).success).toBe(
      false,
    );
  });

  it('still validates non-null values (country regex, mxik 17-digit) after the nullable widening', () => {
    expect(UpdateProductSchema.safeParse({ country: 'XX', version: 1 }).success).toBe(true);
    expect(UpdateProductSchema.safeParse({ country: 'invalid', version: 1 }).success).toBe(false);
    expect(
      UpdateProductSchema.safeParse({ mxikCode: '12345678901234567', version: 1 }).success,
    ).toBe(true);
    expect(UpdateProductSchema.safeParse({ mxikCode: '123', version: 1 }).success).toBe(false);
  });

  it('CREATE schema also tolerates null (widened via the same source fields) — repo/Prisma handle it', () => {
    const r = CreateProductSchema.safeParse({ name: 'X', article: null, buyPrice: null });
    expect(r.success).toBe(true);
  });
});

/**
 * «Доступ — Владелец» (ownerId) create/edit-accept contract.
 *
 * moysklad's create form (and the edit form) let you pick the owning employee
 * («Владелец-сотрудник»). The schema must accept a uuid ownerId on CREATE
 * (omit ⇒ the repo stamps the actor) and accept null on UPDATE to clear it.
 * A non-uuid is rejected (the picker only sends real ids). Invisible to
 * typecheck/lint, so a real schema test.
 */
describe('Product ownerId («Доступ — Владелец») accept', () => {
  const uuid = '22222222-2222-2222-2222-222222222222';

  it('CREATE accepts a uuid ownerId', () => {
    const r = CreateProductSchema.safeParse({ name: 'X', ownerId: uuid });
    if (!r.success) throw r.error;
    expect(r.data.ownerId).toBe(uuid);
  });

  it('CREATE without ownerId leaves it undefined (repo stamps the actor)', () => {
    const r = CreateProductSchema.safeParse({ name: 'X' });
    if (!r.success) throw r.error;
    expect(r.data.ownerId).toBeUndefined();
  });

  it('UPDATE accepts null ownerId (clear the owner)', () => {
    const r = UpdateProductSchema.safeParse({ name: 'X', version: 1, ownerId: null });
    if (!r.success) throw r.error;
    expect(r.data.ownerId).toBeNull();
  });

  it('rejects a non-uuid ownerId', () => {
    expect(CreateProductSchema.safeParse({ name: 'X', ownerId: 'not-a-uuid' }).success).toBe(false);
  });
});

/**
 * .uz marking regime (live-grounded 2026-06-20) + typed barcodes. The «Тип
 * продукции» combo persists Product.trackingType; the moysklad.uz regime adds
 * WATER / APPLIANCES / ALCOHOL / BEER (additive — existing RU codes kept). Typed
 * barcodes ride a parallel `barcodeTypes` array index-aligned with `barcodes`.
 */
describe('TrackingType .uz marking codes + typed barcodes', () => {
  it('CreateProductSchema accepts the new .uz marking trackingType codes', () => {
    for (const tt of ['WATER', 'APPLIANCES', 'ALCOHOL', 'BEER'] as const) {
      const r = CreateProductSchema.safeParse({ name: 'X', trackingType: tt });
      if (!r.success) throw r.error;
      expect(r.data.trackingType).toBe(tt);
    }
  });

  it('accepts a parallel barcodeTypes array, defaulting to [] when omitted', () => {
    const withTypes = CreateProductSchema.safeParse({
      name: 'X',
      barcodes: ['4780000000001'],
      barcodeTypes: ['ean13'],
    });
    if (!withTypes.success) throw withTypes.error;
    expect(withTypes.data.barcodeTypes).toEqual(['ean13']);
    const omitted = CreateProductSchema.safeParse({ name: 'X' });
    if (!omitted.success) throw omitted.error;
    expect(omitted.data.barcodeTypes).toEqual([]);
  });
});

/**
 * Optimistic-lock contract (moysklad parity, lost-update guard).
 *
 * Every product field-edit save must carry the `version` the form loaded so the
 * repository can reject a stale write with 409. The token is REQUIRED on Update
 * (so a forgetful caller can't silently bypass the lock) and ABSENT from Create
 * (a brand-new row has no prior version to conflict with).
 */
describe('UpdateProductSchema optimistic-lock version token', () => {
  it('requires version on update (a save without it is rejected, not silently unguarded)', () => {
    expect(UpdateProductSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ name: 'X', version: 1 }).success).toBe(true);
  });

  it('rejects a non-integer / negative version', () => {
    expect(UpdateProductSchema.safeParse({ name: 'X', version: 1.5 }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ name: 'X', version: -1 }).success).toBe(false);
    expect(UpdateProductSchema.safeParse({ name: 'X', version: '1' }).success).toBe(false);
  });

  it('CREATE schema does not require version (new rows have no prior version)', () => {
    expect(CreateProductSchema.safeParse({ name: 'X' }).success).toBe(true);
  });
});

/**
 * moysklad «Товары и услуги» Фильтр-panel parity (2026-06-11j).
 *
 * The products list filter was enriched from 8 → 15 discrete fields to match
 * the captured moysklad panel (products/states/02-filter-applied.png). These
 * are the query-string contract the FE controls fill; each one must parse and
 * (for the booleans) coerce the "true"/"false" the URL carries. A missing or
 * mis-typed field here = a silently-dropped filter (the page would query as if
 * the control weren't set), invisible to typecheck/lint — hence a real schema
 * test.
 */
describe('ProductFilterSchema moysklad Фильтр-parity fields', () => {
  it('accepts the discrete text + boolean + period filter fields', () => {
    const r = ProductFilterSchema.safeParse({
      description: 'насос',
      mxikCode: '0212',
      barcode: '4780000000001',
      weighed: 'true',
      shared: 'false',
      groupId: '11111111-1111-1111-1111-111111111111',
      updatedFrom: '2026-01-01',
      updatedTo: '2026-06-11',
    });
    if (!r.success) throw r.error;
    // Booleans must coerce from the query-string "true"/"false".
    expect(r.data.weighed).toBe(true);
    expect(r.data.shared).toBe(false);
    expect(r.data.description).toBe('насос');
    expect(r.data.mxikCode).toBe('0212');
    expect(r.data.barcode).toBe('4780000000001');
    expect(r.data.updatedFrom).toBe('2026-01-01');
    expect(r.data.updatedTo).toBe('2026-06-11');
  });

  it('omits the boolean filters entirely when not sent (so they do not force a value)', () => {
    const r = ProductFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    // Undefined — not `false` — so the repo skips the where-clause; only
    // `archived` defaults (to false) by design.
    expect(r.data.weighed).toBeUndefined();
    expect(r.data.shared).toBeUndefined();
    expect(r.data.description).toBeUndefined();
    expect(r.data.updatedFrom).toBeUndefined();
  });

  it('rejects a non-uuid groupId (the Владелец-отдел picker only sends real ids)', () => {
    expect(ProductFilterSchema.safeParse({ groupId: 'not-a-uuid' }).success).toBe(false);
  });

  it('«Показывать» tri-state: absent → false (default view), true/false explicit, all → undefined (no predicate)', () => {
    // Param absent → default false (only non-archived) — the default list view.
    const absent = ProductFilterSchema.safeParse({});
    if (!absent.success) throw absent.error;
    expect(absent.data.archived).toBe(false);
    // 'true'/'false' coerce as before.
    expect(ProductFilterSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(ProductFilterSchema.parse({ archived: 'false' }).archived).toBe(false);
    // 'all' → undefined so the repo applies NO archive predicate (shows both).
    // (Critically this must survive the .default(false) — 'all' is a real input,
    // so the default only fires on a truly-absent param.)
    expect(ProductFilterSchema.parse({ archived: 'all' }).archived).toBeUndefined();
    // A bogus archived value is rejected (only true/false/all accepted).
    expect(ProductFilterSchema.safeParse({ archived: 'maybe' }).success).toBe(false);
  });
});

describe('BulkUpdateSchema «Код упаковки ТАСНИФ» / «Штрихкод ТАСНИФ» (base-pack fields)', () => {
  const ids = ['11111111-1111-1111-1111-111111111111'];

  it('accepts tasnifCode / tasnifBarcode and satisfies the at-least-one-field refine on their own', () => {
    const parsed = BulkUpdateSchema.parse({
      ids,
      tasnifCode: '01234567',
      tasnifBarcode: '4780000000001',
    });
    expect(parsed.tasnifCode).toBe('01234567');
    expect(parsed.tasnifBarcode).toBe('4780000000001');
  });

  it('allows null to clear either base-pack code', () => {
    const parsed = BulkUpdateSchema.parse({ ids, tasnifCode: null, tasnifBarcode: null });
    expect(parsed.tasnifCode).toBeNull();
    expect(parsed.tasnifBarcode).toBeNull();
  });

  it('still rejects an edit with no fields at all (the refine guards empty bulk writes)', () => {
    expect(BulkUpdateSchema.safeParse({ ids }).success).toBe(false);
  });

  it('rejects an over-long ТАСНИФ code (max 50)', () => {
    expect(BulkUpdateSchema.safeParse({ ids, tasnifCode: '0'.repeat(51) }).success).toBe(false);
  });
});

describe('SetSalePriceSchema (pick-modal «Doimiy narx»)', () => {
  it('accepts a plain minor-unit integer string', () => {
    expect(SetSalePriceSchema.parse({ priceMinor: '11000000' }).priceMinor).toBe('11000000');
  });

  it('rejects negatives, decimals, empty and non-numeric strings', () => {
    for (const bad of ['-100', '10.5', '', '1e6', '100 000', null, 100]) {
      expect(SetSalePriceSchema.safeParse({ priceMinor: bad }).success).toBe(false);
    }
  });

  it('rejects >15 digits (int8-overflow guard for downstream document math)', () => {
    expect(SetSalePriceSchema.safeParse({ priceMinor: '9'.repeat(16) }).success).toBe(false);
    expect(SetSalePriceSchema.safeParse({ priceMinor: '9'.repeat(15) }).success).toBe(true);
  });
});

/**
 * Pul maydonlari — buzuq kirish 400 beradi, 500 EMAS; manfiy narx qabul
 * qilinmaydi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): `bigIntString` transformi ichida
 * `BigInt(String(v))` chaqirilardi va u `"1.5"` / `"12 000"` / `"abc"` da
 * `SyntaxError` TASHLARDI. Zod transform ichidagi bunday istisnoni ZodError
 * bo'lib o'ramaydi, ikkala global filtr esa faqat `ZodError` va Prisma
 * xatosini tutadi — natijada mijoz 400 o'rniga xom **500** olardi
 * («Internal server error», Sentry shovqini bilan). Web forma `^\d*$` bilan
 * to'sadi, ya'ni bu yo'l import-skript / curl / boshqa mijozlar uchun ochiq edi.
 *
 * Ikkinchi nuqson: `buyPrice`/`minPrice`/`salePrices[].value` da manfiy son
 * cheklanmagandi (`weightG`/`volumeML` da `nonnegative()` bor edi). Manfiy tan
 * narx narx polini (`min(tan, karta)`) o'chiradi.
 */
describe('pul maydonlari — 400 (500 emas) va manfiy raqamsiz', () => {
  const base = { name: 'X' };

  it('kasrli/probelli/harfli narx ZodError beradi, TASHLAMAYDI', () => {
    for (const bad of ['1.5', '12 000', 'abc', '1e6', '-']) {
      const res = CreateProductSchema.safeParse({ ...base, buyPrice: bad });
      expect(res.success).toBe(false);
    }
    // number ko'rinishidagi kasr ham xuddi shunday
    expect(CreateProductSchema.safeParse({ ...base, buyPrice: 1.5 }).success).toBe(false);
  });

  it('manfiy tan narx / minimal narx rad etiladi', () => {
    expect(CreateProductSchema.safeParse({ ...base, buyPrice: '-500000' }).success).toBe(false);
    expect(CreateProductSchema.safeParse({ ...base, minPrice: '-1' }).success).toBe(false);
  });

  it('manfiy sotuv narxi rad etiladi', () => {
    const bad = { ...base, salePrices: [{ priceTypeId: 'pt-1', value: '-100' }] };
    expect(CreateProductSchema.safeParse(bad).success).toBe(false);
  });

  it("to'g'ri qiymatlar avvalgidek ishlaydi (butun son, 0, bigint, number)", () => {
    expect(CreateProductSchema.parse({ ...base, buyPrice: '4500000' }).buyPrice).toBe(4500000n);
    expect(CreateProductSchema.parse({ ...base, buyPrice: '0' }).buyPrice).toBe(0n);
    expect(CreateProductSchema.parse({ ...base, buyPrice: 4500000 }).buyPrice).toBe(4500000n);
    expect(CreateProductSchema.parse({ ...base, buyPrice: 4500000n }).buyPrice).toBe(4500000n);
  });
});
