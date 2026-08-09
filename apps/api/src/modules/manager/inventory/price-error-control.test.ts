import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_ERROR_THRESHOLDS,
  PRICE_ERROR,
  PRICE_UNCHECKED,
  type PriceErrorThresholds,
  type SoldLineInput,
  reviewSoldLinePrices,
  summarizePriceErrors,
} from './price-error-control.js';

/**
 * MK18 — **xato narx nazorati**. Sof modul (Prisma'siz).
 *
 * Bu modul MK11 (`price-change-control.ts`) dan boshqa savolga javob beradi:
 * MK11 «narx **o'zgardimi**» ni ko'radi, bu yer «narx qiymati **mantiqlimi**»
 * ni ko'radi. Ikkalasi ham HECH NARSANI BLOKLAMAYDI.
 *
 * Uchta xulq rejada ATAYLAB test sifatida yozilgan (`REJA-MENEJER-KASSA` MK18)
 * va shu faylda birinchi turadi:
 *   (1) 10× o'nlik xatosi aniqlanadi;
 *   (2) chegirma sababli past narx xato deb belgilanmaydi;
 *   (3) tan narx NULL bo'lsa «tekshirib bo'lmadi», xato EMAS.
 */

const AT = new Date('2026-08-09T09:00:00.000Z');

function line(over: Partial<SoldLineInput> = {}): SoldLineInput {
  return {
    docType: 'retailsale',
    docId: 'sale-1',
    docName: 'RS-0001',
    lineId: 'line-1',
    productId: 'prod-1',
    productName: 'Kabel 3×2.5',
    quantity: '1',
    priceMinor: 100_000n,
    discountPercent: 0,
    costMinor: 60_000n,
    wholesaleMinor: 80_000n,
    referenceMinor: 100_000n,
    averageMinor: 100_000n,
    averageSampleCount: 10,
    soldById: 'emp-1',
    soldByName: 'Aziz Karimov',
    at: AT,
    ...over,
  };
}

const T = DEFAULT_PRICE_ERROR_THRESHOLDS;
const kindsOf = (l: SoldLineInput, t: PriceErrorThresholds = T) =>
  reviewSoldLinePrices([l], t)[0]?.findings.map((f) => f.kind) ?? [];

// ───────────────────────────────────────────────────────────────────────────
// Rejada nomma-nom talab qilingan uchta xulq
// ───────────────────────────────────────────────────────────────────────────

describe('MK18 rejasining uchta majburiy xulqi', () => {
  it("(1) 10× o'nlik xatosi aniqlanadi", () => {
    const [review] = reviewSoldLinePrices([line({ priceMinor: 1_000_000n })], T);

    expect(review?.findings.map((f) => f.kind)).toContain(PRICE_ERROR.decimalShift);
    const shift = review?.findings.find((f) => f.kind === PRICE_ERROR.decimalShift);
    expect(shift?.factor).toBe(10);
    expect(shift?.expectedMinor).toBe(100_000n);
    // Pul ta'siri ishorali: mijozdan ortiqcha olindi ⇒ musbat.
    expect(shift?.amountMinor).toBe(900_000n);
  });

  it("(1b) 0.1× o'nlik xatosi ham aniqlanadi va ta'siri MANFIY", () => {
    const [review] = reviewSoldLinePrices([line({ priceMinor: 10_000n })], T);
    const shift = review?.findings.find((f) => f.kind === PRICE_ERROR.decimalShift);

    expect(shift?.factor).toBe(0.1);
    expect(shift?.amountMinor).toBe(-90_000n);
  });

  it('(2) chegirma sababli past narx XATO deb belgilanmaydi', () => {
    // Tan narx 60 000, optom 80 000. Narx 50 000 — ikkala poldan past.
    // LEKIN qatorda 50% chegirma bor: bu ataylab qilingan ish, xato emas.
    const discounted = line({ priceMinor: 50_000n, discountPercent: 50 });

    expect(kindsOf(discounted)).not.toContain(PRICE_ERROR.belowCost);
    expect(kindsOf(discounted)).not.toContain(PRICE_ERROR.belowWholesale);
    // Jimgina tashlanmaydi — NEGA tekshirilmagani ochiq yoziladi.
    expect(reviewSoldLinePrices([discounted], T)[0]?.unchecked).toContain(
      PRICE_UNCHECKED.discounted,
    );
  });

  it("(2b) chegirmasiz AYNI narx esa xato deb belgilanadi — gate chegirmaga bog'liq", () => {
    const plain = line({ priceMinor: 50_000n, discountPercent: 0 });

    expect(kindsOf(plain)).toContain(PRICE_ERROR.belowCost);
    expect(kindsOf(plain)).toContain(PRICE_ERROR.belowWholesale);
  });

  it("(3) tan narx NULL bo'lsa «tekshirib bo'lmadi» — xato EMAS", () => {
    const noCost = line({ priceMinor: 1n, costMinor: null });
    const [review] = reviewSoldLinePrices([noCost], T);

    expect(review?.findings.map((f) => f.kind)).not.toContain(PRICE_ERROR.belowCost);
    expect(review?.unchecked).toContain(PRICE_UNCHECKED.noCost);
  });

  it("(3b) tan narx 0 ham «yig'ilmagan» — 0 tan narx SOTUVNI oqlamaydi", () => {
    // `Stock.costBalanceMinor` va `Product.buyPrice` DEFAULT 0 — 0 = «yozilmagan».
    // Uni haqiqiy narx deb olish har sotuvni «100% marja» qilib ko'rsatardi.
    const [review] = reviewSoldLinePrices([line({ costMinor: 0n })], T);

    expect(review?.unchecked).toContain(PRICE_UNCHECKED.noCost);
    expect(review?.findings.map((f) => f.kind)).not.toContain(PRICE_ERROR.belowCost);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Bloklamaslik — shartnoma, qulaylik emas
// ───────────────────────────────────────────────────────────────────────────

describe('nazorat hech qachon bloklamaydi', () => {
  it('har hukmda `blocks` literal false', () => {
    const reviews = reviewSoldLinePrices([line(), line({ priceMinor: 0n })], T);

    for (const r of reviews) expect(r.blocks).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Nol / bo'sh narx
// ───────────────────────────────────────────────────────────────────────────

describe('ZERO_PRICE — nol yoki manfiy narx', () => {
  it("0 narx chegirmadan QAT'I NAZAR belgilanadi", () => {
    // 100% chegirma `discount` maydonida ifodalanadi; birlik narxini 0 qilib
    // yozish narxni umuman yo'qotadi — keyin foyda ham, chegirma ham ko'rinmaydi.
    expect(kindsOf(line({ priceMinor: 0n, discountPercent: 100 }))).toContain(
      PRICE_ERROR.zeroPrice,
    );
  });

  it('manfiy narx ham shu belgiga tushadi', () => {
    expect(kindsOf(line({ priceMinor: -5_000n }))).toContain(PRICE_ERROR.zeroPrice);
  });

  it('nol narxda BOSHQA detektorlar ishlamaydi — bitta aniq tashxis', () => {
    // 0 narx tan narxdan ham, optomdan ham past; ularni ham yozish bir
    // muammoni uch qatorga bo'lib navbatni shovqinga ko'mardi.
    const kinds = kindsOf(line({ priceMinor: 0n }));

    expect(kinds).toEqual([PRICE_ERROR.zeroPrice]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// O'nlik xatosi
// ───────────────────────────────────────────────────────────────────────────

describe("DECIMAL_SHIFT — o'nlik xatosi", () => {
  it('tolerans ichidagi 10× belgilanadi', () => {
    // 5% tolerans ⇒ [9.5×, 10.5×] oralig'i.
    expect(kindsOf(line({ priceMinor: 1_040_000n }))).toContain(PRICE_ERROR.decimalShift);
  });

  it('toleransdan tashqarida 10× emas — boshqa detektorga qoladi', () => {
    const kinds = kindsOf(line({ priceMinor: 1_100_000n }));

    expect(kinds).not.toContain(PRICE_ERROR.decimalShift);
  });

  it("oddiy 2× qimmat narx o'nlik xatosi EMAS", () => {
    expect(kindsOf(line({ priceMinor: 200_000n }))).not.toContain(PRICE_ERROR.decimalShift);
  });

  it("karta narxi yo'q bo'lsa — «tekshirib bo'lmadi», taxmin emas", () => {
    const [review] = reviewSoldLinePrices([line({ referenceMinor: null, priceMinor: 9n })], T);

    expect(review?.findings.map((f) => f.kind)).not.toContain(PRICE_ERROR.decimalShift);
    expect(review?.unchecked).toContain(PRICE_UNCHECKED.noReference);
  });

  it("o'nlik xatosi chegirma bilan YASHIRILMAYDI", () => {
    // 90% chegirma 0.1× ga o'xshaydi, lekin bu yerda `priceMinor` chegirmagacha
    // bo'lgan narx: 10× yozuv chegirma bilan tushuntirilmaydi.
    expect(kindsOf(line({ priceMinor: 1_000_000n, discountPercent: 90 }))).toContain(
      PRICE_ERROR.decimalShift,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Pollar — tan narx va optom
// ───────────────────────────────────────────────────────────────────────────

describe('BELOW_COST / BELOW_WHOLESALE — pollar', () => {
  it("tan narxdan past sotuv zarari BUTUN MIQDOR bo'yicha o'lchanadi", () => {
    const [review] = reviewSoldLinePrices(
      [line({ priceMinor: 50_000n, quantity: '3', wholesaleMinor: null })],
      T,
    );
    const found = review?.findings.find((f) => f.kind === PRICE_ERROR.belowCost);

    expect(found?.expectedMinor).toBe(60_000n);
    // (60 000 − 50 000) × 3 — birlikka emas, qatorga.
    expect(found?.amountMinor).toBe(30_000n);
  });

  it("kasr miqdor (og'irlik/uzunlik) ham to'g'ri ko'paytiriladi", () => {
    const [review] = reviewSoldLinePrices(
      [line({ priceMinor: 50_000n, quantity: '2.5', wholesaleMinor: null })],
      T,
    );

    expect(review?.findings.find((f) => f.kind === PRICE_ERROR.belowCost)?.amountMinor).toBe(
      25_000n,
    );
  });

  it("optom narx turi tanlanmagan bo'lsa — «tekshirib bo'lmadi»", () => {
    const [review] = reviewSoldLinePrices([line({ priceMinor: 50_000n, wholesaleMinor: null })], T);

    expect(review?.findings.map((f) => f.kind)).not.toContain(PRICE_ERROR.belowWholesale);
    expect(review?.unchecked).toContain(PRICE_UNCHECKED.noWholesale);
  });

  it("poldan past bo'lmagan narx belgilanmaydi", () => {
    expect(kindsOf(line())).toHaveLength(0);
  });

  it("tan narxga TENG narx past emas (qat'iy kichik shart)", () => {
    expect(kindsOf(line({ priceMinor: 60_000n, wholesaleMinor: 60_000n }))).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// O'rtachadan keskin farq
// ───────────────────────────────────────────────────────────────────────────

describe("PRICE_OUTLIER — o'rtachadan keskin farq", () => {
  it("o'rtachadan 50%dan ko'p yuqori narx belgilanadi", () => {
    const [review] = reviewSoldLinePrices(
      [line({ priceMinor: 200_000n, averageMinor: 100_000n, referenceMinor: null })],
      T,
    );
    const found = review?.findings.find((f) => f.kind === PRICE_ERROR.outlier);

    expect(found?.expectedMinor).toBe(100_000n);
    expect(found?.amountMinor).toBe(100_000n);
  });

  it("namuna kam bo'lsa o'rtacha ISHONCHSIZ — hukm chiqarilmaydi", () => {
    // Ikki sotuvning o'rtachasi statistik dalil emas; undan «keskin farq»
    // chiqarish birinchi noodatiy sotuvni abadiy ayblab qo'yardi.
    const [review] = reviewSoldLinePrices(
      [
        line({
          priceMinor: 500_000n,
          averageMinor: 100_000n,
          averageSampleCount: 2,
          referenceMinor: null,
        }),
      ],
      T,
    );

    expect(review?.findings.map((f) => f.kind)).not.toContain(PRICE_ERROR.outlier);
    expect(review?.unchecked).toContain(PRICE_UNCHECKED.noAverage);
  });

  it("o'nlik xatosi topilganda outlier TAKROR yozilmaydi (aniqroq tashxis ustun)", () => {
    const kinds = kindsOf(line({ priceMinor: 1_000_000n, averageMinor: 100_000n }));

    expect(kinds).toContain(PRICE_ERROR.decimalShift);
    expect(kinds).not.toContain(PRICE_ERROR.outlier);
  });

  it('chegirma PAST tomonni oqlaydi, YUQORI tomonni oqlamaydi', () => {
    const low = line({
      priceMinor: 20_000n,
      averageMinor: 100_000n,
      referenceMinor: null,
      discountPercent: 80,
      costMinor: null,
      wholesaleMinor: null,
    });
    const high = line({
      priceMinor: 300_000n,
      averageMinor: 100_000n,
      referenceMinor: null,
      discountPercent: 80,
    });

    expect(kindsOf(low)).not.toContain(PRICE_ERROR.outlier);
    // Chegirma qimmatlashishni tushuntirmaydi — bu boshqa hodisa.
    expect(kindsOf(high)).toContain(PRICE_ERROR.outlier);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Navbat elementi (MK06 ombori uchun)
// ───────────────────────────────────────────────────────────────────────────

describe('navbat elementi', () => {
  it('toza qatorda element YARATILMAYDI', () => {
    expect(reviewSoldLinePrices([line()], T)[0]?.workItem).toBeNull();
  });

  it('bir qator — BITTA element, ichida barcha belgilar', () => {
    const [review] = reviewSoldLinePrices([line({ priceMinor: 50_000n, quantity: '2' })], T);

    expect(review?.findings.length).toBeGreaterThan(1);
    expect(review?.workItem?.ruleType).toBe('PRICE_ERROR');
    expect(review?.workItem?.context.kinds).toEqual(
      expect.arrayContaining([PRICE_ERROR.belowCost, PRICE_ERROR.belowWholesale]),
    );
  });

  it("dedupKey qator bo'yicha BARQAROR — belgilar ro'yxati o'zgarsa ham", () => {
    const a = reviewSoldLinePrices([line({ priceMinor: 50_000n })], T)[0];
    const b = reviewSoldLinePrices([line({ priceMinor: 50_000n, wholesaleMinor: null })], T)[0];

    expect(a?.workItem?.dedupKey).toBe('price_error:retailsale:line-1');
    expect(b?.workItem?.dedupKey).toBe(a?.workItem?.dedupKey);
  });

  it("«kim» — sotgan xodim; «qancha» — eng katta mutlaq ta'sir", () => {
    const [review] = reviewSoldLinePrices([line({ priceMinor: 50_000n, quantity: '2' })], T);

    expect(review?.workItem?.subjectEmployeeId).toBe('emp-1');
    // belowCost (10 000 × 2 = 20 000) va belowWholesale (30 000 × 2 = 60 000)
    // ichidan kattarog'i — menejer ro'yxatni og'irlik bo'yicha saralaydi.
    expect(review?.workItem?.amountMinor).toBe(60_000n);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Xulosa
// ───────────────────────────────────────────────────────────────────────────

describe('summarizePriceErrors', () => {
  it("belgi turlari bo'yicha sanaydi va tekshirilmaganini ALOHIDA ko'rsatadi", () => {
    const reviews = reviewSoldLinePrices(
      [
        line({ priceMinor: 50_000n }), // belowCost + belowWholesale
        line({ lineId: 'line-2', priceMinor: 0n }), // zeroPrice
        line({ lineId: 'line-3', costMinor: null, wholesaleMinor: null }), // toza, 2 unchecked
      ],
      T,
    );
    const summary = summarizePriceErrors(reviews);

    expect(summary.flaggedLineCount).toBe(2);
    expect(summary.byKind[PRICE_ERROR.belowCost]).toBe(1);
    expect(summary.byKind[PRICE_ERROR.zeroPrice]).toBe(1);
    expect(summary.byKind[PRICE_ERROR.outlier]).toBe(0);
    // Faqat 3-qator: tan narx ham, optom ham yo'q. 1- va 2-qatorlarda barcha
    // mo'ljallar mavjud edi, 2-qator esa nol narxda qisqa tutashgan.
    expect(summary.uncheckedLineCount).toBe(1);
  });

  it("bo'sh ro'yxat — nol, undefined emas", () => {
    const summary = summarizePriceErrors([]);

    expect(summary.flaggedLineCount).toBe(0);
    expect(summary.byKind[PRICE_ERROR.decimalShift]).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Chegaralar kodda qattiq emas
// ───────────────────────────────────────────────────────────────────────────

describe('chegaralar sozlanadi', () => {
  it("outlier foizi ko'tarilsa hukm yo'qoladi", () => {
    const l = line({ priceMinor: 200_000n, averageMinor: 100_000n, referenceMinor: null });

    expect(kindsOf(l, { ...T, outlierPercent: 200 })).not.toContain(PRICE_ERROR.outlier);
  });

  it('tolerans toraysa chekka 10× hukmdan chiqadi', () => {
    const l = line({ priceMinor: 1_040_000n });

    expect(kindsOf(l, { ...T, decimalTolerancePercent: 1 })).not.toContain(
      PRICE_ERROR.decimalShift,
    );
  });
});
