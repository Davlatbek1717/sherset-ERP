import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Farq akti ulanish qulfi (kassa TZ §8.4).
 *
 * To'rt invariant — hech birini typecheck ham, sof modul testlari ham
 * tutmaydi:
 *
 * 1. **Akt holat qulfidan KEYIN yoziladi.** `updateMany` optimistik qulf:
 *    faqat bitta chaqiruv o'tadi. Aktni oldin yozsak, poyga yutqazgan
 *    ikkinchi chaqiruv ham akt yozib qo'yardi (bir smenaga ikki akt).
 * 2. **Akt/xabar nosozligi yopishni YIQITMAYDI.** Kassir ishini davom
 *    ettirishi kerak: bir texnik nosozlik butun kassani to'xtatmasin.
 * 3. **Idempotentlik** — `skipDuplicates` + unique(session, currency).
 * 4. **USD akti faqat SANALGANDA yoziladi** (MK31 da yangilandi — quyida
 *    sababi bilan).
 */
const SERVICE = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

function closeBody(): string {
  const start = SERVICE.indexOf('async close(');
  expect(start, 'close() topilmadi').toBeGreaterThan(-1);
  const end = SERVICE.indexOf('\n  private async ensure', start);
  return SERVICE.slice(start, end === -1 ? start + 6000 : end);
}

function recordBody(): string {
  const start = SERVICE.indexOf('private async recordVariance');
  expect(start, 'recordVariance topilmadi').toBeGreaterThan(-1);
  const end = SERVICE.indexOf('\n  async zReport', start);
  return SERVICE.slice(start, end === -1 ? start + 6000 : end);
}

describe('smena farq akti — ulanish', () => {
  it('akt HOLAT QULFIDAN KEYIN yoziladi', () => {
    const body = closeBody();
    const flip = body.indexOf('flipResult.count === 0');
    const record = body.indexOf('this.recordVariance(');
    expect(flip, 'optimistik qulf tekshiruvi yo`q').toBeGreaterThan(-1);
    expect(record, 'recordVariance chaqirilmaydi').toBeGreaterThan(-1);
    // Aks holda poyga yutqazgan chaqiruv ham akt yozardi.
    expect(record).toBeGreaterThan(flip);
  });

  it('akt/xabar nosozligi yopishni yiqitmaydi (try/catch)', () => {
    const body = recordBody();
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch\s*\(/);
    // Xato yutilmaydi — jurnalga tushadi.
    expect(body).toMatch(/logger\.(warn|error)/);
  });

  it('takroriy akt yaratilmaydi (idempotent)', () => {
    expect(recordBody()).toContain('skipDuplicates: true');
  });

  it('nol farqda akt ham, xabar ham yo`q', () => {
    const body = recordBody();
    // `acts.length === 0` da erta qaytish: aks holda bo'sh xabar ketardi.
    expect(body).toMatch(/acts\.length === 0/);
    const early = body.indexOf('acts.length === 0');
    const outbox = body.indexOf('hrTelegramOutbox.create');
    expect(outbox).toBeGreaterThan(early);
  });

  it('xabar navbatga qo`yiladi (to`g`ridan-to`g`ri yuborilmaydi)', () => {
    // Navbat = qayta urinish + audit. To'g'ridan-to'g'ri yuborish
    // Telegram uzilishida xabarni butunlay yo'qotardi.
    const body = recordBody();
    expect(body).toContain('hrTelegramOutbox.create');
    expect(body).toContain("status: 'pending'");
    expect(body).toContain("sourceEventType: 'kassa.smena_farqi'");
  });

  /**
   * MK31 da SHARTNOMA O'ZGARDI (test o'chirilmadi — qayta yozildi).
   *
   * Eski shart: «USD akti hech qachon yozilmaydi». U vaqtinchalik yechim edi
   * va sababi aniq yozilgan: CASH_USD ulanmagani uchun kutilgan USD
   * hisoblanmasdi, uni 0 deb olish esa har smenada soxta «USD ortiqcha»
   * akti berardi. Endi USD naqd oqimi ULANDI (`collectUsdCashInputs` →
   * `expectedUsdCashMinor`), ya'ni eski shartning SABABI yo'qoldi: kutilgan
   * USD haqiqiy raqam. Uni o'z kuchida qoldirish endi teskari xatoni
   * qulflardi — kassadagi dollar kamomadi hech qachon aktga tushmasdi.
   *
   * Yangi shart eski shartning MAQSADINI (soxta akt yozilmasin) saqlaydi:
   * akt faqat dollar HAQIQATAN sanalganda rejalanadi.
   */
  it('USD akti UZS bilan BIR chaqiruvda rejalanadi', () => {
    const body = recordBody();
    expect(body).toMatch(/currency: 'UZS'/);
    expect(body).toMatch(/currency: 'USD'/);
  });

  it('USD akti faqat dollar SANALGANDA rejalanadi (sanalmagan ≠ 0)', () => {
    // `null` = «sanalmagan». Uni 0 deb olsak, dollar oqimi bo'lgan smenada
    // to'liq kamomad akti yozilardi — eski testning soxta-signal xavfi
    // aynan shu yerdan qaytib kelardi.
    const body = recordBody();
    expect(body).toMatch(/closingCashUsd != null/);
    const guard = body.indexOf('closingCashUsd != null');
    const usdAct = body.indexOf("currency: 'USD'");
    expect(guard).toBeGreaterThan(-1);
    expect(usdAct).toBeGreaterThan(guard);
  });

  it('farq CashierSession da ham saqlanadi (akt yozilmasa ham raqam qoladi)', () => {
    expect(closeBody()).toMatch(/discrepancyMinor: discrepancy/);
  });
});

/**
 * MK31 — dollar naqd oqimining ULANISHI (kassa TZ §8.4).
 *
 * Bu yerdagi to'rt invariant ham sof modul testlari bilan tutilmaydi:
 * formulalar to'g'ri, lekin ular CHAQIRILMASA dollar baribir o'lchanmay
 * qolardi (aynan MK31 gacha bo'lgan holat).
 */
describe('dollar naqd oqimi — ulanish (MK31)', () => {
  it('kutilgan dollar UMUMIY sof funksiyadan olinadi (nusxa formula yo`q)', () => {
    // Nusxa formula qoldirilsa, biri jimgina eskirardi — §100 bug'ining
    // aynan shu klassi (drawer in/out kutilgandan tushib qolgan edi).
    const body = closeBody();
    expect(body).toContain('this.collectUsdCashInputs(');
    expect(body).toContain('expectedUsdCashMinor(');
  });

  it('dollar oqimi BOR smenada sanoq MAJBURIY (jim 0 qabul qilinmaydi)', () => {
    // Aks holda kassir maydonni tashlab ketsa, yashiqdagi dollar
    // hisobga olinmasdan smena yopilardi — o'lchov yana yo'qolardi.
    const body = closeBody();
    expect(body).toMatch(/expectedUsd !== 0n && closingCashUsd === null/);
    expect(body).toMatch(/BadRequestException/);
  });

  it('dollar sanog`i/kutilgani/farqi smenaga SAQLANADI', () => {
    const body = closeBody();
    expect(body).toContain('closingCashUsdMinor: closingCashUsd');
    expect(body).toContain('expectedCashUsdMinor: expectedUsd');
    expect(body).toContain('discrepancyUsdMinor: discrepancyUsd');
  });

  it('dollar oqimi YO`Q smenada ustunlar TEGILMAYDI (NULL bo`lib qoladi)', () => {
    // Har yopishda 0 yozilsa, «dollar bilan ishlamaydigan kassa» va
    // «dollar sanaldi, 0 chiqdi» bir xil ko'rinardi.
    expect(closeBody()).toMatch(/usdTouched/);
  });
});

describe('Z-hisobot — §8.5 ulanishi', () => {
  function zBody(): string {
    const start = SERVICE.indexOf('async zReport(');
    const end = SERVICE.indexOf('\n  // ---- Xarajat', start);
    return SERVICE.slice(start, end === -1 ? start + 9000 : end);
  }

  it('tushum RetailSalePayment dan olinadi (aralash to`lov ajratilsin)', () => {
    // `cashAmountMinor`/`cardAmountMinor` ikki ustundan kanalni tiklab
    // bo'lmaydi — §6.1 shuning uchun har turni alohida qator qiladi.
    expect(zBody()).toContain('retailSalePayment.groupBy');
  });

  it('kutilgan naqd UMUMIY metoddan olinadi (nusxa formula yo`q)', () => {
    expect(zBody()).toContain('this.collectCashInputs(');
  });

  it('xarajat va inkassatsiya ALOHIDA qatorlarda', () => {
    const body = zBody();
    expect(body).toContain('expenseMinor');
    expect(body).toContain('collectionMinor');
    expect(body).toContain('expenseByItem');
  });

  it('dollar qatori: kutilgan/sanalgan/farq Z-hisobotda bor (MK31 · §8.5)', () => {
    const body = zBody();
    expect(body).toContain('expectedUsdCashMinor:');
    expect(body).toContain('countedUsdCashMinor:');
    expect(body).toContain('varianceUsdMinor');
  });

  it('tushum jamiga SO`MGA o`girilgan qiymat kiradi (kursi yo`q qator emas)', () => {
    // `amountMinor` bo'yicha jamlash sentni tiyinga qo'shib, tushumni
    // buzardi; kursi yo'q qatorni jim tashlash esa hisobotni to'liq
    // ko'rinishda kam raqam bilan qoldirardi (Faza 17 shartnomasi).
    const body = zBody();
    expect(body).toContain('amountBaseMinor: true');
    expect(body).toContain('unconvertedByMethod');
    expect(body).toMatch(/rateMinor: null/);
  });

  it('tan narx muzlatilmagan qatorda yalpi foyda NULL bo`ladi', () => {
    // `?? 0n` = «100% marja» yolg'oni (tan-narx shartnomasi).
    const body = zBody();
    expect(body).toMatch(/costMinor == null/);
    expect(body).toMatch(/grossProfitMinor = null/);
    expect(body).not.toMatch(/costMinor \?\? 0n/);
  });
});

describe('farq akti — menejer tomoni', () => {
  function ackBody(): string {
    const start = SERVICE.indexOf('async acknowledgeVariance');
    expect(start, 'acknowledgeVariance topilmadi').toBeGreaterThan(-1);
    return SERVICE.slice(start, start + 2500);
  }

  it('tan olish SUMMALARGA tegmaydi (akt — dalil)', () => {
    // Farq raqamini tahrirlash imkoni bo'lsa, akt dalil bo'lishdan to'xtardi.
    const body = ackBody();
    expect(body).not.toMatch(/varianceMinor:/);
    expect(body).not.toMatch(/expectedMinor:|countedMinor:/);
    expect(body).not.toMatch(/cashierNote:/);
  });

  it('qayta tan olishda BIRINCHI vaqt saqlanadi', () => {
    // Aks holda «qachon ko'rildi» har bosishda surilib ketardi.
    expect(ackBody()).toMatch(/if \(row\.acknowledgedAt\)/);
  });

  it('ro`yxat default FAQAT ko`rilmaganlarni beradi', () => {
    const list = SERVICE.slice(
      SERVICE.indexOf('async listVariances'),
      SERVICE.indexOf('async acknowledgeVariance'),
    );
    expect(list).toMatch(/acknowledgedAt: null/);
    expect(list).toMatch(/'pending'/);
  });

  it('ko`rilmaganlar soni filtrdan QAT`I NAZAR qaytadi', () => {
    // Menejer filtrni o'zgartirsa ham «nechta ish qoldi» yo'qolmasin.
    const list = SERVICE.slice(
      SERVICE.indexOf('async listVariances'),
      SERVICE.indexOf('async acknowledgeVariance'),
    );
    expect(list).toMatch(/pendingCount/);
  });
});
