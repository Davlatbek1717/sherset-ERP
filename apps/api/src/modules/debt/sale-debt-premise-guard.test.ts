/**
 * Q6 — ESKIRGAN PREMISE'LARNING QO'RIQCHISI (2026-08-25).
 *
 * 🔴 NEGA BU TEST BOR (F5 saboqi). Q1…Q5 «kassa chekidan kelgan qarz `Debt`
 * reyestriga YOZILMAYDI» degan premise'ni BEKOR QILDI. O'sha premise repo
 * bo'ylab BESH joyda takrorlangan edi va ularning har biri keyingi o'quvchini
 * noto'g'ri xulosaga olib borardi:
 *
 *   · `debt.service.ts` — «demak reyestrda faqat qo'lda ochilgan qarz bor»;
 *   · `recompute-counterparty-balances.ts` — «demak `balanceAdopted` filtrini
 *      olib tashlasa ham bo'ladi» (⇒ `APPLY=1` saldoni SHISHIRARDI);
 *   · `counterparty-settlement.util.ts` — «demak har `Debt` qatorining o'z
 *      `applyDelta` si bor»;
 *   · `pos-customer-debt.ts` — «demak tarixiy qoldiqni backfill qilib
 *      bo'lmaydi» (Q5 aynan shuni qildi, zinapoya bilan);
 *   · `schema.prisma` — «`balanceAdopted` qatorini faqat to'lov yo'li ochadi».
 *
 * Izohlarni bir marta tuzatish YETMAYDI: keyingi refaktor ularni yana eski
 * holatiga qaytarishi mumkin. Shuning uchun har biri MEXANIK qulflanadi —
 * eski jumla qaytsa yoki bekor qilish belgisi yo'qolsa test QIZIL bo'ladi.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Izoh matnini QATOR SINISHIDAN mustaqil qiladi: `//`, `*`, `///` prefikslari
 * olib tashlanadi va bo'shliqlar bittaga keltiriladi.
 *
 * 🔴 NEGA KERAK: eski jumlani qidirish qator sinishiga bog'liq bo'lsa,
 * qo'riqchi TASODIFAN yashil bo'ladi — `debt.service.ts` da aynan shunday
 * edi («reyestrga YOZILMAYDI —» dan keyin qator sinardi, ya'ni qidirilgan
 * satr hech qachon topilmasdi va test hech nimani qulflamasdi).
 */
const flat = (src: string): string =>
  src.replace(/^[ \t]*(\/\/\/?|\*)[ \t]?/gm, ' ').replace(/\s+/g, ' ');

/**
 * ESKI PREMISE'NING YAGONA RUXSAT ETILGAN HOLATI — **bekor qilish blokining
 * ICHIDA, ko'chirma sifatida.**
 *
 * 🔴 NEGA «umuman bo'lmasin» EMAS (F5 saboqi): eski dalilni jimgina
 * o'chirish keyingi o'quvchiga «bu yerda hech qachon boshqacha bo'lmagan»
 * degan taassurot qoldiradi va u xuddi shu xatoni qaytadan qiladi. To'g'ri
 * naqsh — eski matnni KO'CHIRMA qilib saqlash va yonida nega bekor
 * qilinganini yozish. Shuning uchun qoida: jumla bekor belgisidan KEYIN
 * kelishi va faqat BIR marta uchrashi shart.
 */
function expectCancelledQuote(src: string, phrase: string, marker = 'BEKOR QILINDI') {
  const f = flat(src);
  const at = f.indexOf(phrase);
  expect(at, `eski jumla topilmadi (qo'riqchi ko'r bo'lib qolgan): ${phrase}`).toBeGreaterThan(-1);
  const markerAt = f.indexOf(marker);
  expect(markerAt, `bekor belgisi yo'q: ${marker}`).toBeGreaterThan(-1);
  // Ko'chirma bekor belgisidan KEYIN — ya'ni u da'vo emas, tarix.
  expect(markerAt).toBeLessThan(at);
  // Bir marta: ikkinchi nusxa bekor blokidan tashqarida TIRIK da'vo bo'lardi.
  expect(f.split(phrase).length - 1).toBe(1);
}

const DEBT_SERVICE = read('./debt.service.ts');
const POS_CUSTOMER_DEBT = read('./pos-customer-debt.ts');
const RETAIL_SALE = read('../retail-sale/retail-sale.service.ts');
const SETTLEMENT = read('../counterparty-settlement/counterparty-settlement.util.ts');
const RECOMPUTE = read('../../scripts/recompute-counterparty-balances.ts');
const SCHEMA = read('../../../../../packages/db/prisma/schema.prisma');

describe('Q6 — «chekdan reyestrga yozilmaydi» premise`i hech qayerda TIRIK emas', () => {
  it('🔴 `debt.service.ts` — eski jumla YO`Q, bekor belgisi BOR', () => {
    expectCancelledQuote(DEBT_SERVICE, 'reyestrga YOZILMAYDI — u faqat balansga');
    expect(DEBT_SERVICE).toContain('ESKI DALIL BEKOR QILINDI');
    // Yangi dalil ISHORANI aytadi: `create` ning `applyDelta` si vs
    // `balanceAdopted` qatorining `applyDelta` SIZLIGI.
    expect(DEBT_SERVICE).toContain('balanceAdopted');
  });

  it('🔴 `recompute-counterparty-balances.ts` — «reyestrga EMAS» dalili BEKOR', () => {
    expectCancelledQuote(RECOMPUTE, 'reyestrga EMAS, shuning uchun');
    expect(RECOMPUTE).toContain('ESKI DALIL BEKOR QILINDI');
  });

  it('🔴 filtr O`CHIRILSA saldo shishishi izohda OCHIQ aytilgan', () => {
    // Bu izoh bo'lmasa keyingi o'quvchi filtrni «ortiqcha» deb olib tashlardi.
    expect(RECOMPUTE).toMatch(/filtr O'CHIRILSA[\s\S]{0,200}SHISHIRADI/);
  });

  it('🔴 `retail-sale.service.ts` — eski izoh BEKOR deb belgilangan (Q2)', () => {
    expect(RETAIL_SALE).toContain('BEKOR');
    expect(RETAIL_SALE).toMatch(/QILINDI \(Q2/);
  });

  it('🔴 `counterparty-settlement.util.ts` — mexanizm o`zgargani qayd etilgan', () => {
    expect(SETTLEMENT).toContain('MEXANIZM O');
    expect(SETTLEMENT).toContain('balanceAdopted');
    // Xulosa esa O'ZGARMAYDI: reyestr qoldig'i saldoning TARKIBI.
    expect(SETTLEMENT).toContain('IKKI DAFTAR QO');
  });
});

describe('Q6 — Q5 backfill`i «portlaydi» ogohlantirishini eskirtirdi', () => {
  it('🔴 `pos-customer-debt.ts` da Q5 yangilanishi BOR', () => {
    expect(POS_CUSTOMER_DEBT).toContain('Q5 (2026-08-25) YANGILANISHI');
  });

  it('🔴 F9 ning «chekdan `Debt` yozib yuborish» taqiqi ham BEKOR belgilangan', () => {
    // Bu premise'ning IKKI yarmi bor va ular endi TENG EMAS: «qo'shib
    // qo'yish» taqiqi kuchda, «yozib yuborish» taqiqi bekor. Farq
    // aytilmasa keyingi o'quvchi ikkalasini ham kuchda deb o'qiydi.
    expectCancelledQuote(POS_CUSTOMER_DEBT, 'chekdan `Debt` yozib yuborish');
    expect(flat(POS_CUSTOMER_DEBT)).toMatch(/IKKINCHI YARMI ENDI YOLG'ON/);
  });

  it('🔴 ogohlantirishning QAYSI yarmi kuchda qolgani AYTILGAN', () => {
    // «adopsiya yo'lida butun qoldiq olinmaydi» ✅ ·«backfill qilib bo'lmaydi» ❌
    expect(POS_CUSTOMER_DEBT).toContain('ops-q5-backfill-sale-debts.ts');
    expect(POS_CUSTOMER_DEBT).toMatch(/ZINAPOYA|zinapoya/);
  });
});

describe('Q6 — `balanceAdopted` ning UCH yozuvchisi sxemada sanalgan', () => {
  it('🔴 «faqat to`lov paytida» degan eski jumla endi yolg`iz turmaydi', () => {
    expect(SCHEMA).toContain('YOZUVCHILAR ENDI UCHTA');
  });

  it('uchala yozuvchi ham NOMI bilan yozilgan', () => {
    expect(SCHEMA).toContain('adoptBalanceDebt');
    expect(SCHEMA).toContain('writeSaleDebtRegistryRow');
    expect(SCHEMA).toContain('ops-q5-backfill-sale-debts.ts');
  });

  it('🔴 uchalasi ham `applyDelta` chaqirmasligi va filtr bilan bog`liqligi aytilgan', () => {
    expect(SCHEMA).toMatch(/applyDelta[\s\S]{0,120}CHAQIRMAYDI/);
    expect(SCHEMA).toContain('balanceAdopted: false');
  });
});
