import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_THRESHOLD_PERCENT,
  PRICE_FIELD,
  PRICE_UNMEASURED,
  type PriceAuditRow,
  extractPriceChanges,
  reviewPriceChanges,
} from './price-change-control.js';

/**
 * 4M.8 — narx o'zgarishi tarixi va chegarasi.
 *
 * ENG MUHIM XULQ: nazorat **BLOKLAMAYDI**. Egasining falsafasi (4-bo'lim TZ
 * §5.1) — «erkinlik + keyingi nazorat»: narx o'zgaradi, menejer keyin ko'radi.
 * Shuning uchun har hukmda `blocks:false` qat'iy yozilgan va test bilan
 * qulflangan — kelajakda kimdir bu yerdan «taqiq» yasab qo'ymasin.
 */

const AT = new Date('2026-08-09T09:00:00.000Z');

function auditRow(over: Partial<PriceAuditRow> = {}): PriceAuditRow {
  return {
    id: 'audit-1',
    entityId: 'prod-1',
    userId: 'emp-1',
    userName: 'Aziz Karimov',
    at: AT,
    fieldChanges: { buyPrice: { before: '500000', after: '600000' } },
    ...over,
  };
}

describe('extractPriceChanges — AuditLog.fieldChanges dan tarix', () => {
  it("buyPrice o'zgarishini kim/qachon/qancha bilan chiqaradi", () => {
    const [change, ...rest] = extractPriceChanges([auditRow()], { 'prod-1': 'Kabel 3×2.5' });
    expect(rest).toHaveLength(0);
    expect(change).toMatchObject({
      auditId: 'audit-1',
      productId: 'prod-1',
      productName: 'Kabel 3×2.5',
      field: PRICE_FIELD.buy,
      beforeMinor: 500_000n,
      afterMinor: 600_000n,
      deltaMinor: 100_000n,
      deltaPercent: 20,
      changedById: 'emp-1',
      changedByName: 'Aziz Karimov',
    });
    expect(change?.at).toEqual(AT);
  });

  it("narxga aloqasi yo'q maydonlar tashlanadi", () => {
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            name: { before: 'A', after: 'B' },
            article: { before: null, after: 'X' },
          },
        }),
      ],
      {},
    );
    expect(changes).toEqual([]);
  });

  it('minPrice ham nazoratda (zararga sotuv chegarasi shundan quriladi)', () => {
    const changes = extractPriceChanges(
      [auditRow({ fieldChanges: { minPrice: { before: '100000', after: '90000' } } })],
      {},
    );
    expect(changes[0]).toMatchObject({
      field: PRICE_FIELD.min,
      deltaMinor: -10_000n,
      deltaPercent: -10,
    });
  });

  it("salePrices massivi narx turi bo'yicha taqqoslanadi", () => {
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            salePrices: {
              before: [
                { priceTypeId: 'pt-chakana', value: 1_000_000, currencyCode: 'UZS' },
                { priceTypeId: 'pt-optom', value: 900_000, currencyCode: 'UZS' },
              ],
              after: [
                { priceTypeId: 'pt-chakana', value: 1_500_000, currencyCode: 'UZS' },
                { priceTypeId: 'pt-optom', value: 900_000, currencyCode: 'UZS' },
              ],
            },
          },
        }),
      ],
      {},
    );
    // Faqat O'ZGARGAN narx turi chiqadi — o'zgarmagani shovqin bo'lardi.
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: PRICE_FIELD.sale,
      priceTypeId: 'pt-chakana',
      beforeMinor: 1_000_000n,
      afterMinor: 1_500_000n,
      deltaPercent: 50,
    });
  });

  it("yangi qo'shilgan narx turi ham ko'rinadi (bazasi yo'q)", () => {
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            salePrices: {
              before: [],
              after: [{ priceTypeId: 'pt-yangi', value: 700_000, currencyCode: 'UZS' }],
            },
          },
        }),
      ],
      {},
    );
    expect(changes[0]).toMatchObject({
      beforeMinor: null,
      afterMinor: 700_000n,
      deltaPercent: null,
    });
  });

  it('pick-modal «Doimiy narx» yozuvi ({default: …}) ham tarixga tushadi', () => {
    // product.service.setDefaultSalePrice AYNAN shu shaklni yozadi.
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: { salePrices: { before: undefined, after: { default: '850000' } } },
        }),
      ],
      {},
    );
    expect(changes[0]).toMatchObject({
      field: PRICE_FIELD.sale,
      priceTypeId: 'default',
      beforeMinor: null,
      afterMinor: 850_000n,
      deltaPercent: null,
    });
  });

  it("bir yozuvda bir nechta narx maydoni o'zgarsa — har biri alohida qator", () => {
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            buyPrice: { before: '100000', after: '120000' },
            minPrice: { before: '150000', after: '180000' },
            name: { before: 'A', after: 'B' },
          },
        }),
      ],
      {},
    );
    expect(changes.map((c) => c.field).sort()).toEqual([PRICE_FIELD.buy, PRICE_FIELD.min].sort());
  });

  it('buzuq/kutilmagan fieldChanges yiqitmaydi — qator jim tashlanadi', () => {
    const changes = extractPriceChanges(
      [
        auditRow({ fieldChanges: null }),
        auditRow({ id: 'a2', fieldChanges: 'buzuq' as unknown as Record<string, unknown> }),
        auditRow({ id: 'a3', fieldChanges: { buyPrice: 'raqam emas' } }),
        auditRow({ id: 'a4', fieldChanges: { buyPrice: { before: 'xxx', after: 'yyy' } } }),
      ],
      {},
    );
    expect(changes).toEqual([]);
  });

  it("eng yangi o'zgarish tepada", () => {
    const older = auditRow({ id: 'a-old', at: new Date('2026-08-01T00:00:00.000Z') });
    const newer = auditRow({ id: 'a-new', at: new Date('2026-08-08T00:00:00.000Z') });
    expect(extractPriceChanges([older, newer], {}).map((c) => c.auditId)).toEqual([
      'a-new',
      'a-old',
    ]);
  });
});

describe("NULL ≠ 0 — foizni hisoblab bo'lmasa NULL", () => {
  it("baza narx yo'q ⇒ foiz NULL (0% EMAS) va chegara qo'llanmaydi", () => {
    const changes = extractPriceChanges(
      [auditRow({ fieldChanges: { buyPrice: { before: null, after: '900000' } } })],
      {},
    );
    expect(changes[0]?.deltaPercent).toBeNull();
    expect(changes[0]?.unmeasuredReason).toBe(PRICE_UNMEASURED.noBaseline);

    const [review] = reviewPriceChanges(changes, { thresholdPercent: 20 });
    expect(review?.exceedsThreshold).toBe(false);
    expect(review?.workItem).toBeNull();
  });

  it("baza narx 0 ⇒ bo'lish yo'q, foiz NULL", () => {
    const changes = extractPriceChanges(
      [auditRow({ fieldChanges: { buyPrice: { before: '0', after: '500000' } } })],
      {},
    );
    expect(changes[0]?.deltaPercent).toBeNull();
    expect(changes[0]?.unmeasuredReason).toBe(PRICE_UNMEASURED.noBaseline);
  });

  it("valyuta almashsa foiz taqqoslanmaydi (kurs bu yerda yo'q)", () => {
    const changes = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            salePrices: {
              before: [{ priceTypeId: 'pt-1', value: 1_000_000, currencyCode: 'UZS' }],
              after: [{ priceTypeId: 'pt-1', value: 100_000, currencyCode: 'USD' }],
            },
          },
        }),
      ],
      {},
    );
    expect(changes[0]?.deltaPercent).toBeNull();
    expect(changes[0]?.unmeasuredReason).toBe(PRICE_UNMEASURED.currencyMismatch);
    expect(reviewPriceChanges(changes, { thresholdPercent: 20 })[0]?.workItem).toBeNull();
  });
});

describe('reviewPriceChanges — chegara navbat yaratadi, AMALNI BLOKLAMAYDI', () => {
  const changes = () => extractPriceChanges([auditRow()], { 'prod-1': 'Kabel 3×2.5' }); // +20%

  it("chegaradan oshgan o'zgarish navbat elementi yaratadi", () => {
    const [review] = reviewPriceChanges(changes(), { thresholdPercent: 10 });
    expect(review?.exceedsThreshold).toBe(true);
    expect(review?.workItem).not.toBeNull();
    expect(review?.workItem).toMatchObject({
      ruleType: 'PRICE_CHANGE',
      docType: 'product',
      docId: 'prod-1',
      subjectEmployeeId: 'emp-1',
      amountMinor: 100_000n,
    });
    expect(review?.workItem?.context).toMatchObject({
      field: PRICE_FIELD.buy,
      beforeMinor: 500_000n,
      afterMinor: 600_000n,
      deltaPercent: 20,
      thresholdPercent: 10,
    });
  });

  it('navbat elementi HECH QACHON bloklamaydi (regressiya qulfi)', () => {
    for (const threshold of [0, 5, 10, 20, 100]) {
      for (const review of reviewPriceChanges(changes(), { thresholdPercent: threshold })) {
        expect(review.blocks).toBe(false);
      }
    }
  });

  it("chegaradan past o'zgarish navbatga tushmaydi, lekin TARIXDA qoladi", () => {
    const [review] = reviewPriceChanges(changes(), { thresholdPercent: 25 });
    expect(review?.exceedsThreshold).toBe(false);
    expect(review?.workItem).toBeNull();
    expect(review?.deltaPercent).toBe(20); // tarix yo'qolmaydi
  });

  it('aynan chegaraga teng — «oshgan» emas (yarim ochiq oraliq)', () => {
    const [review] = reviewPriceChanges(changes(), { thresholdPercent: 20 });
    expect(review?.exceedsThreshold).toBe(false);
  });

  it('narx TUSHISHI ham nazoratda (mutlaq qiymat)', () => {
    const drop = extractPriceChanges(
      [auditRow({ fieldChanges: { buyPrice: { before: '600000', after: '400000' } } })],
      {},
    );
    const [review] = reviewPriceChanges(drop, { thresholdPercent: 20 });
    expect(review?.deltaPercent).toBeCloseTo(-33.33, 2);
    expect(review?.exceedsThreshold).toBe(true);
    expect(review?.workItem?.amountMinor).toBe(-200_000n);
  });

  it('dedup kaliti barqaror — bir hodisa ikki marta element yaratmaydi', () => {
    const first = reviewPriceChanges(changes(), { thresholdPercent: 10 })[0]?.workItem?.dedupKey;
    const second = reviewPriceChanges(changes(), { thresholdPercent: 10 })[0]?.workItem?.dedupKey;
    expect(first).toBe(second);
    expect(first).toContain('audit-1');
  });

  it('bir yozuvdagi ikki narx turi ikki xil dedup kaliti oladi', () => {
    const both = extractPriceChanges(
      [
        auditRow({
          fieldChanges: {
            salePrices: {
              before: [
                { priceTypeId: 'pt-1', value: 100_000, currencyCode: 'UZS' },
                { priceTypeId: 'pt-2', value: 100_000, currencyCode: 'UZS' },
              ],
              after: [
                { priceTypeId: 'pt-1', value: 200_000, currencyCode: 'UZS' },
                { priceTypeId: 'pt-2', value: 300_000, currencyCode: 'UZS' },
              ],
            },
          },
        }),
      ],
      {},
    );
    const keys = reviewPriceChanges(both, { thresholdPercent: 10 }).map(
      (r) => r.workItem?.dedupKey,
    );
    expect(new Set(keys).size).toBe(2);
  });

  it("boshlang'ich chegara hujjatlangan va aql bovar qiladigan", () => {
    expect(DEFAULT_PRICE_THRESHOLD_PERCENT).toBe(20);
  });
});
