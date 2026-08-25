import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_SRC_ROOT,
  DECLARED_BALANCE_WRITERS,
  SCRIPT_SOURCES,
  assertCounterpartyBalanceCoverage,
  scanBalanceWriters,
} from './counterparty-balance-sources.js';

/**
 * DUP-02 qamrov-qulfi (audit 2026-08-08, CRITICAL).
 *
 * `recompute-counterparty-balances.ts` materialized `CounterpartyBalance` ni
 * hujjatlardan QAYTA QURADI: manbalarda ko'rinmagan kontragentning nishoni 0
 * bo'ladi va `APPLY=1` uni jimgina 0 ga yozadi. Ya'ni skript qamramagan har
 * bir `applyDelta` yozuvchisi — pul-ma'lumot yo'qolishi.
 *
 * Non-vakuum: bu test yozilgan paytda `debt/debt.service.ts` (QRZ- qarz
 * ochilishi, 2026-08-05) va `retail-sale/retail-sale.service.ts` (POS qarzga
 * sotuv + qarz-qaytarish) balansga yozardi-yu skript ularni BILMASDI —
 * `assertCounterpartyBalanceCoverage()` aynan shu ikkovini QAMROVSIZ deb
 * yiqitgan.
 */

const SCRIPT_PATH = join(API_SRC_ROOT, 'scripts', 'recompute-counterparty-balances.ts');
const SCRIPT_SRC = readFileSync(SCRIPT_PATH, 'utf8');

describe('counterparty-balance qamrov reyestri (DUP-02)', () => {
  it("skanner manba-daraxtdan yozuvchilarni topadi (skanner o'zi ishlaydi)", () => {
    const found = scanBalanceWriters();
    // Non-vakuum: skanner haqiqatan ishlayotganini ko'rsatadigan lang'ar.
    expect(found.length).toBeGreaterThanOrEqual(12);
    expect(found).toContain('modules/invoice-out/invoice-out.service.ts');
    expect(found).toContain('modules/debt/debt-recalc.ts');
  });

  it("applyDelta E'LONI va testlar yozuvchi deb sanalmaydi", () => {
    const found = scanBalanceWriters();
    expect(found).not.toContain('modules/counterparty-balance/counterparty-balance.service.ts');
    expect(found.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
  });

  it('izohdagi «applyDelta» eslatmasi yozuvchi deb sanalmaydi', () => {
    // Bu ikki fayl `applyDelta` ni faqat premise-izohida tilga oladi.
    const found = scanBalanceWriters();
    expect(found).not.toContain('modules/counterparty-settlement/counterparty-settlement.util.ts');
    expect(found).not.toContain('modules/counterparty-statement/counterparty-statement.service.ts');
  });

  it("HAR yozuvchi reyestrda e'lon qilingan (yangi yozuvchi → shu test yiqiladi)", () => {
    expect(() => assertCounterpartyBalanceCoverage()).not.toThrow();
  });

  it("reyestrda yangi yozuvchi paydo bo'lsa QAMROVSIZ deb yiqiladi", () => {
    const withNewWriter = [...scanBalanceWriters(), 'modules/loyalty/loyalty.service.ts'];
    expect(() => assertCounterpartyBalanceCoverage(withNewWriter)).toThrow(
      /QAMROVSIZ[\s\S]*modules\/loyalty\/loyalty\.service\.ts/,
    );
  });

  it('reyestrda eskirgan yozuv qolsa ham yiqiladi', () => {
    const withoutOne = scanBalanceWriters().filter((f) => f !== 'modules/debt/debt-recalc.ts');
    expect(() => assertCounterpartyBalanceCoverage(withoutOne)).toThrow(
      /ESKIRGAN[\s\S]*modules\/debt\/debt-recalc\.ts/,
    );
  });
});

describe("reyestr ↔ skript bog'lanishi", () => {
  it('reyestrdagi har manba skriptda `SOURCE:` markeri bilan mavjud', () => {
    for (const source of new Set(DECLARED_BALANCE_WRITERS.flatMap((w) => w.sources))) {
      expect(SCRIPT_SRC, `skriptda «SOURCE: ${source}» bloki yo'q`).toContain(`SOURCE: ${source}`);
    }
  });

  it("e'lon qilingan manbalar SCRIPT_SOURCES ro'yxatidan olinadi", () => {
    for (const w of DECLARED_BALANCE_WRITERS) {
      for (const s of w.sources) expect(SCRIPT_SOURCES).toContain(s);
    }
  });

  it('skript birinchi yozuvdan OLDIN qamrovni tekshiradi', () => {
    // Faqat import qilib qo'yish yetarli emas — chaqirilishi ham kerak.
    expect(SCRIPT_SRC).toMatch(/assertCounterpartyBalanceCoverage\(\)/);
    const guardAt = SCRIPT_SRC.indexOf('assertCounterpartyBalanceCoverage()');
    const firstWriteAt = SCRIPT_SRC.indexOf('counterpartyBalance.upsert');
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWriteAt).toBeGreaterThan(guardAt);
  });
});

describe('skript manbalari yozuvchilar semantikasiga mos (DUP-02 fix)', () => {
  it('QRZ- qarz ochilishi (debt-issue) Σ totalMinor bilan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: debt-issue');
    expect(SCRIPT_SRC).toMatch(/prisma\.debt\.groupBy/);
    expect(SCRIPT_SRC).toMatch(/_sum:\s*\{\s*totalMinor:\s*true\s*\}/);
  });

  it('POS qarzga sotuv DEBT tender qatorlaridan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: retail-credit');
    expect(SCRIPT_SRC).toMatch(/prisma\.retailSalePayment\.findMany/);
    expect(SCRIPT_SRC).toMatch(/TENDER\.debt/);
  });

  it('POS qarz-qaytarish (debtReturnMinor) teskari ishora bilan qayta quriladi', () => {
    expect(SCRIPT_SRC).toContain('SOURCE: retail-credit-refund');
    expect(SCRIPT_SRC).toMatch(/debtReturnMinor/);
  });

  /**
   * Faza 12 (`DUP-03`) `DebtService.remove()` ga reversal qo'shdi — ya'ni
   * o'chirilgan qarzning `+totalMinor` deltasi daftarda ENDI QOLMAYDI.
   * Shuning uchun rekonstruksiya ham uni qo'shmasligi SHART: aks holda
   * `APPLY=1` o'chirilgan qarzni saldoga qaytarib olib kelardi.
   *
   * Ikki tomon bitta testda qulflanadi — biri o'zgarib, ikkinchisi qolib
   * ketsa (aynan Faza 8 ↔ Faza 12 orasidagi xavf) test yiqiladi.
   */
  it('debt.remove() reversali ↔ skriptning deletedAt filtri birga yuradi', () => {
    const debtSrc = readFileSync(join(API_SRC_ROOT, 'modules', 'debt', 'debt.service.ts'), 'utf8');
    const removeBody = debtSrc.slice(debtSrc.indexOf('async remove('));
    // remove() create'ning deltasini teskarisiga yozadi (`-debt.totalMinor`).
    expect(removeBody).toMatch(/applyDelta\s*\(/);
    expect(removeBody).toMatch(/-debt\.totalMinor/);
    // Demak rekonstruksiya o'chirilgan qarzni SANAMAYDI. Da'vo AYNAN
    // `groupBy` chaqirig'ining tanasiga bog'lanadi — izohda «deletedAt: null»
    // so'zi turgani hech narsani isbotlamaydi (CLAUDE.md §4).
    const callStart = SCRIPT_SRC.indexOf('prisma.debt.groupBy');
    expect(callStart).toBeGreaterThan(0);
    const groupByCall = SCRIPT_SRC.slice(callStart, SCRIPT_SRC.indexOf('});', callStart));
    expect(groupByCall).toMatch(/where:[\s\S]*deletedAt:\s*null/);
  });

  /**
   * Faza 13 (`PP-03`, QAROR-B «Supply-only») — xarid qarzini FAQAT `Supply`
   * yozadi. Uch tomon bitta testda qulflanadi, chunki ular birga o'zgarishi
   * shart: (a) `InvoiceIn` servisi `applyDelta` chaqirmasligi, (b) reyestrda
   * uning yozuvi yo'qligi, (c) skriptning `fixed` ro'yxatida `prisma.invoiceIn`
   * yo'qligi. Bittasi qaytib qo'shilsa — bitta xaridda qarz yana 2× bo'lardi.
   */
  it('InvoiceIn balansga TEGMAYDI — servis, reyestr va skript birga', () => {
    const invoiceInSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'invoice-in', 'invoice-in.service.ts'),
      'utf8',
    );
    // Izohlar tashlab yuboriladi: bu fayl `applyDelta` ni faqat izohda eslaydi.
    const code = invoiceInSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.applyDelta\s*\(/);
    expect(scanBalanceWriters()).not.toContain('modules/invoice-in/invoice-in.service.ts');
    expect(DECLARED_BALANCE_WRITERS.map((w) => w.file)).not.toContain(
      'modules/invoice-in/invoice-in.service.ts',
    );
    expect(SCRIPT_SRC).not.toMatch(/prisma\.invoiceIn as unknown as GroupByDelegate/);
  });

  /** Faza 13 (`PP-02`) — qaytarish qabul deltasining teskarisini yozadi. */
  it('PurchaseReturn qamrovda va skriptda MUSBAT ishora bilan turadi', () => {
    expect(scanBalanceWriters()).toContain('modules/purchase-return/purchase-return.service.ts');
    expect(SCRIPT_SRC).toMatch(/prisma\.purchaseReturn as unknown as GroupByDelegate, 1n/);
  });

  /**
   * 🔴 Q1 (2026-08-25, reja §2.1) — ADOPSIYA QATORLARI hujjat-hisobiga KIRMAYDI.
   *
   * P1 dan beri reyestrda balansga UMUMAN yozmaydigan qator turi bor
   * (`balanceAdopted = true`): ochilishi `applyDelta` chaqirmaydi va
   * `remove()` ham unga teskari delta yozmaydi. `debt-issue` manbasi esa
   * BARCHA `totalMinor` ni qo'shardi — ya'ni cross-check «hujjatlar ≠ jurnal»
   * deb YOLG‘ON farq ko‘rsatardi va skriptning yagona diagnostik signali
   * ishonchsiz bo‘lardi.
   *
   * Uch tomon BITTA testda qulflanadi, chunki ular birga o'zgarishi shart:
   * (a) adopsiya qatori ochilishida `applyDelta` yo‘q, (b) `remove()` uni
   * bayroq bilan chetlab o‘tadi, (c) skriptning `groupBy` i uni sanamaydi.
   */
  it('adopsiya qatori (balanceAdopted) ↔ skriptning filtri birga yuradi', () => {
    // (a) Adopsiya qatori ochilganda balansga yozilmaydi — `adoptBalanceDebt`
    // tanasida `applyDelta` chaqirig'i YO'Q.
    const posSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'debt', 'pos-debt-payment.service.ts'),
      'utf8',
    );
    const adoptStart = posSrc.indexOf('private async adoptBalanceDebt(');
    expect(adoptStart).toBeGreaterThan(0);
    const adoptBody = posSrc.slice(adoptStart, posSrc.indexOf('\n  /**', adoptStart));
    expect(adoptBody).toContain('balanceAdopted: true');
    expect(adoptBody).not.toMatch(/\.applyDelta\s*\(/);

    // (b) `remove()` teskari deltani bayroq bilan to‘sadi.
    const debtSrc = readFileSync(join(API_SRC_ROOT, 'modules', 'debt', 'debt.service.ts'), 'utf8');
    const removeBody = debtSrc.slice(debtSrc.indexOf('async remove('));
    expect(removeBody).toMatch(/if\s*\(!debt\.balanceAdopted\)/);

    // (c) Demak rekonstruksiya ham ularni SANAMAYDI. Da‘vo AYNAN `groupBy`
    // chaqirig‘ining TANASIGA bog‘lanadi — izohdagi so‘z dalil emas (CLAUDE.md §4).
    const callStart = SCRIPT_SRC.indexOf('prisma.debt.groupBy');
    expect(callStart).toBeGreaterThan(0);
    const groupByCall = SCRIPT_SRC.slice(callStart, SCRIPT_SRC.indexOf('});', callStart));
    expect(groupByCall).toMatch(/where:[\s\S]*balanceAdopted:\s*false/);
  });

  /**
   * 🔴 Q3 (2026-08-25) — «`totalMinor` create'dan keyin O'ZGARMAYDI»
   * DA'VOSI ENDI YOLG'ON, va izoh shuni aytishi SHART.
   *
   * Q3 dan beri `retail-sale.service.ts#moveSaleDebtRegistryRow` chekdan
   * tug'ilgan qatorning `totalMinor` ini vozvrat/tahrirda o'zgartiradi.
   * Skript baribir to'g'ri qoladi — o'sha qatorlar `balanceAdopted = true`,
   * ya'ni `groupBy` filtri ularni chiqarib tashlaydi — LEKIN eskirgan izoh
   * keyingi o'quvchini «demak filtrni olib tashlasa ham bo'ladi» degan
   * noto'g'ri xulosaga olib borardi (F5 sabog'i).
   */
  it("Q3: `totalMinor` o'zgarmas degan eskirgan da'vo izohda TUZATILGAN", () => {
    // (a) Harakatlantiruvchi rostdan ham `totalMinor` ni yozadi.
    const saleSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'retail-sale', 'retail-sale.service.ts'),
      'utf8',
    );
    const moveStart = saleSrc.indexOf('private async moveSaleDebtRegistryRow');
    expect(moveStart).toBeGreaterThan(0);
    const moveBody = saleSrc.slice(moveStart, saleSrc.indexOf('\n  /**', moveStart));
    expect(moveBody).toMatch(/totalMinor:\s*plan\.nextTotalMinor/);

    // (b) Demak skriptning izohi bu haqiqatni AYTISHI kerak — aks holda
    // filtrning nega majburiyligi ko'rinmay qoladi.
    const callStart = SCRIPT_SRC.indexOf('prisma.debt.groupBy');
    const commentBlock = SCRIPT_SRC.slice(Math.max(0, callStart - 2000), callStart);
    expect(commentBlock).toContain('Q3');
    expect(commentBlock).toMatch(/refund\(\)|moveSaleDebtRegistryRow/);
  });

  /**
   * Non-vakuum: filtr rostdan ham `debt-issue` blokida turibdi, boshqa
   * manbaga tasodifan tushib qolmagan.
   */
  it('balanceAdopted filtri AYNAN debt-issue manbasida turadi', () => {
    const blockStart = SCRIPT_SRC.indexOf('SOURCE: debt-issue');
    const blockEnd = SCRIPT_SRC.indexOf('SOURCE: retail-credit', blockStart);
    expect(blockStart).toBeGreaterThan(0);
    expect(blockEnd).toBeGreaterThan(blockStart);
    expect(SCRIPT_SRC.slice(blockStart, blockEnd)).toMatch(/balanceAdopted:\s*false/);
  });

  /**
   * 🔴 A1 (2026-08-25, reja §1.3) — MIJOZ AVANSI YANGI BALANS MANBASI.
   *
   * `CashierSessionService.customerPrepay` kassada qabul qilingan avansda
   * `applyDelta(−sumMinor)` yozadi. Rekonstruksiya manbasi UNUTILSA
   * cross-check har avansli mijozda «hujjatlar ≠ jurnal» degan YOLG'ON farq
   * ko'rsatardi — bu reja §2.1 dagi mavjud yoriqning aynan takrori bo'lardi
   * (A2 `PREPAY` tenderi uchun ham AYNI narsa kerak bo'ladi).
   *
   * Uch tomon BITTA testda qulflanadi: (a) yozuvchi rostdan ham MANFIY delta
   * yozadi, (b) reyestrda `customer-prepays` manbasi e'lon qilingan,
   * (c) skript blokining TANASI `kind='customer_prepay'` bo'yicha yig'adi va
   * ishorani TESKARI qo'yadi.
   */
  it('A1: mijoz avansi ↔ `customer-prepays` manbasi birga yuradi', () => {
    // (a) Yozuvchi: manfiy delta + `customerPrepay` docType.
    const svcSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'cashier-session', 'cashier-session.service.ts'),
      'utf8',
    );
    const prepayStart = svcSrc.indexOf('async customerPrepay(');
    expect(prepayStart).toBeGreaterThan(0);
    const prepayBody = svcSrc.slice(prepayStart, svcSrc.indexOf('\n  /**', prepayStart));
    expect(prepayBody).toMatch(/applyDelta\([^)]*,\s*-sumMinor\s*,/);
    expect(prepayBody).toMatch(/docType:\s*BALANCE_DOC_TYPE\.customerPrepay/);

    // (b) Reyestrda e'lon qilingan.
    const writer = DECLARED_BALANCE_WRITERS.find(
      (w) => w.file === 'modules/cashier-session/cashier-session.service.ts',
    );
    expect(writer?.sources).toContain('customer-prepays');

    // (c) Skript bloki — da'vo izohga emas, `groupBy` TANASIGA bog'lanadi.
    const blockStart = SCRIPT_SRC.indexOf('SOURCE: customer-prepays');
    expect(blockStart).toBeGreaterThan(0);
    const callStart = SCRIPT_SRC.indexOf('prisma.retailDrawerCashIn.groupBy', blockStart);
    expect(callStart).toBeGreaterThan(blockStart);
    const block = SCRIPT_SRC.slice(callStart, SCRIPT_SRC.indexOf('});', callStart));
    expect(block).toMatch(/kind:\s*'customer_prepay'/);
    expect(block).toMatch(/by:\s*\[[^\]]*'agentId'/);
    // Ishora TESKARI (`return-payouts` musbat, avans manfiy).
    expect(SCRIPT_SRC.slice(callStart, callStart + 900)).toMatch(/add\([^)]*-\(r\._sum\.sumMinor/);
  });

  /**
   * «Внесение» (`kind='topup'`) balansga UMUMAN tegmaydi — u kontragentsiz.
   * Filtr olib tashlansa yoki kengaytirilsa, kontragentsiz kirimlar ham
   * manbaga tushib cross-checkni buzardi.
   */
  it('A1: `topup` manbaga KIRMAYDI (filtr AYNAN customer_prepay)', () => {
    const blockStart = SCRIPT_SRC.indexOf('SOURCE: customer-prepays');
    const callStart = SCRIPT_SRC.indexOf('prisma.retailDrawerCashIn.groupBy', blockStart);
    const block = SCRIPT_SRC.slice(callStart, SCRIPT_SRC.indexOf('});', callStart));
    expect(block).not.toMatch(/kind:\s*'topup'/);
    expect(block).toMatch(/agentId:\s*ONLY_CP\s*\?\s*ONLY_CP\s*:\s*\{\s*not:\s*null\s*\}/);
  });

  /**
   * 🔴 A2 (2026-08-25, reja A2 vazifasi 7) — AVANSDAN TO'LOV YANGI BALANS
   * MANBASI. A1 hisobotining 1-eslatmasi aynan shu haqda ogohlantirgan edi:
   * «`recompute-counterparty-balances.ts` ga `PREPAY` tender manbasini
   * QO'SHISHNI UNUTMANG — unutilsa `APPLY=1` avanslarni yo'q qiladi».
   *
   * A1 dagi bilan AYNI uch tomonlama qulf: yozuvchi ↔ reyestr ↔ skript
   * blokining TANASI (izoh emas).
   */
  it('A2: avansdan to`lov ↔ `sale-prepay` manbasi birga yuradi', () => {
    // (a) Yozuvchi: MUSBAT delta + `salePrepay` docType, `retail-sale` da.
    const svcSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'retail-sale', 'retail-sale.service.ts'),
      'utf8',
    );
    expect(svcSrc).toMatch(/docType:\s*'salePrepay'/);

    // (b) Reyestrda e'lon qilingan — IKKALA yo'nalish ham (sarf va vozvrat).
    const writer = DECLARED_BALANCE_WRITERS.find(
      (w) => w.file === 'modules/retail-sale/retail-sale.service.ts',
    );
    expect(writer?.sources).toContain('sale-prepay');
    expect(writer?.sources).toContain('sale-prepay-refund');

    // (c) Skript bloklari — filtr `PREPAY` tenderi bo'yicha va ishoralar
    // QARAMA-QARSHI (sarf `+`, vozvrat `−`). Ikkalasi bir ishorada bo'lsa
    // qaytarilgan avans ikki marta qo'shilib hisobni buzardi.
    const spendStart = SCRIPT_SRC.indexOf('SOURCE: sale-prepay —');
    expect(spendStart).toBeGreaterThan(0);
    const refundStart = SCRIPT_SRC.indexOf('SOURCE: sale-prepay-refund');
    expect(refundStart).toBeGreaterThan(spendStart);

    const spendBlock = SCRIPT_SRC.slice(spendStart, refundStart);
    expect(spendBlock).toMatch(/method:\s*TENDER\.prepay/);
    // Mirror (vozvrat) cheklari sarf blokidan CHIQARILADI.
    expect(spendBlock).toMatch(/refundedFromId:\s*null/);
    expect(spendBlock).toMatch(/add\([^)]*l\.amountMinor\)/);

    const refundBlock = SCRIPT_SRC.slice(refundStart, SCRIPT_SRC.indexOf('NISHON', refundStart));
    expect(refundBlock).toMatch(/method:\s*TENDER\.prepay/);
    expect(refundBlock).toMatch(/refundedFromId:\s*\{\s*not:\s*null\s*\}/);
    expect(refundBlock).toMatch(/add\([^)]*-l\.amountMinor\)/);
  });

  /**
   * Kontragenti aniqlanmagan avans qatori JIMGINA o'tmaydi — skript to'xtaydi.
   * `retail-credit` dagi AYNI qaror: rekonstruksiya kimningdir avansini
   * yo'qotib, saldosini kamaytirib yozardi.
   */
  it('A2: mijozi aniqlanmagan avans qatori skriptni TO`XTATADI', () => {
    const spendStart = SCRIPT_SRC.indexOf('SOURCE: sale-prepay —');
    const block = SCRIPT_SRC.slice(spendStart, SCRIPT_SRC.indexOf('NISHON', spendStart));
    expect(block).toMatch(/orphanPrepay/);
    expect(block).toMatch(/throw new Error\(/);
  });

  /**
   * 🔴 A3 (2026-08-25) — AVANSNI NAQD QAYTARISH TO'RTINCHI YANGI MANBA.
   *
   * A1 va A2 hisobotlari ikki marta ogohlantirgan: yangi balans-yozuvchi
   * qo'shilib, `recompute` manbasi unutilsa cross-check yolg'on farq
   * ko'rsatadi (va Faza 10 dan oldingi versiyada `APPLY=1` pulni yo'q
   * qilardi). A1/A2 dagi AYNI uch tomonlama qulf.
   */
  it('A3: avansni qaytarish ↔ `customer-prepay-refunds` manbasi birga yuradi', () => {
    // (a) Yozuvchi: MUSBAT delta + `customerPrepayRefund` docType.
    const svcSrc = readFileSync(
      join(API_SRC_ROOT, 'modules', 'cashier-session', 'cashier-session.service.ts'),
      'utf8',
    );
    const start = svcSrc.indexOf('async customerPrepayRefund(');
    expect(start).toBeGreaterThan(0);
    const body = svcSrc.slice(
      start,
      svcSrc.indexOf(
        String.raw`
  /**`,
        start,
      ),
    );
    expect(body).toMatch(/applyDelta\([^)]*,\s*requested\s*,/);
    expect(body).toMatch(/docType:\s*BALANCE_DOC_TYPE\.customerPrepayRefund/);

    // (b) Reyestrda e'lon qilingan.
    const writer = DECLARED_BALANCE_WRITERS.find(
      (w) => w.file === 'modules/cashier-session/cashier-session.service.ts',
    );
    expect(writer?.sources).toContain('customer-prepay-refunds');

    // (c) Skript bloki — da'vo izohga emas, `groupBy` TANASIGA bog'lanadi:
    // AYNI jadval (`return-payouts` bilan), lekin BOSHQA `kind`.
    const blockStart = SCRIPT_SRC.indexOf('SOURCE: customer-prepay-refunds');
    expect(blockStart).toBeGreaterThan(0);
    const callStart = SCRIPT_SRC.indexOf('prisma.retailDrawerCashOut.groupBy', blockStart);
    expect(callStart).toBeGreaterThan(blockStart);
    const block = SCRIPT_SRC.slice(callStart, SCRIPT_SRC.indexOf('});', callStart));
    expect(block).toMatch(/kind:\s*'prepay_refund'/);
    expect(block).toMatch(/by:\s*\[[^\]]*'agentId'/);
    // Ishora MUSBAT — A1 ning `customer-prepays` (manfiy) ko'zgusi.
    expect(SCRIPT_SRC.slice(callStart, callStart + 900)).toMatch(
      /add\([^)]*r\._sum\.sumMinor \?\? 0n\)/,
    );
  });

  it('A3: `return_payout` va `prepay_refund` bloklari ALOHIDA', () => {
    // Bitta blokka yig'ilsa hujjat darajasida «bu qaysi pul edi» savoli
    // javobsiz qolardi, va `kind` filtri kengaytirilsa boshqa turlar ham
    // jimgina qo'shilib ketishi mumkin edi.
    const payoutStart = SCRIPT_SRC.indexOf('SOURCE: return-payouts');
    const refundStart = SCRIPT_SRC.indexOf('SOURCE: customer-prepay-refunds');
    expect(payoutStart).toBeGreaterThan(0);
    expect(refundStart).toBeGreaterThan(payoutStart);
    const payoutBlock = SCRIPT_SRC.slice(payoutStart, refundStart);
    expect(payoutBlock).toMatch(/kind:\s*'return_payout'/);
    expect(payoutBlock).not.toMatch(/kind:\s*'prepay_refund'/);
  });
});
