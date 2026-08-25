import { describe, expect, it } from 'vitest';
import { type RawDoc, computeStatement, docTypeLabel } from './statement-compute.util.js';

/**
 * FAZA 10 (`DUP-08`) — bu testlar SHAKLI o'zgardi: ilgari `d(...)` ga MUTLAQ
 * summa berilib, debet/kredit tomoni HUJJAT TURIDAN chiqarilardi. Aynan o'sha
 * «tur → tomon» xaritasi bug-klassning ildizi edi (xaritada yo'q tur = qator
 * ham, saldo ham yo'qoladi). Endi qatorga `applyDelta` qo'llagan BELGILI delta
 * beriladi, tomon esa belgidan kelib chiqadi — shuning uchun quyidagi
 * stsenariylarda ishoralar OCHIQ yozilgan (ular hujjat semantikasini emas,
 * bosh daftardagi haqiqiy deltani hujjatlaydi).
 */
const d = (
  iso: string,
  docType: string,
  deltaMinor: bigint,
  items: RawDoc['items'] = [],
): RawDoc => ({ moment: new Date(iso), docType, docNumber: 'X', deltaMinor, items });

describe('computeStatement', () => {
  it('empty → all zeros', () => {
    const r = computeStatement([]);
    expect(r.lines).toEqual([]);
    expect(r.finalBalanceMinor).toBe(0n);
    expect(r.turnoverMinor).toBe(0n);
  });

  it('single sale → they owe us (debit, positive balance)', () => {
    const r = computeStatement([d('2026-07-01', 'invoiceOut', 100n)]);
    expect(r.lines[0]?.debitMinor).toBe(100n);
    expect(r.lines[0]?.creditMinor).toBe(0n);
    expect(r.lines[0]?.runningBalanceMinor).toBe(100n);
    expect(r.finalBalanceMinor).toBe(100n);
  });

  it('sale then partial payment → remaining debt', () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'cashIn', -60n),
    ]);
    expect(r.lines[1]?.runningBalanceMinor).toBe(40n);
    expect(r.finalBalanceMinor).toBe(40n); // they owe us 40
    expect(r.totalDebitMinor).toBe(100n);
    expect(r.totalCreditMinor).toBe(60n);
    expect(r.turnoverMinor).toBe(160n);
  });

  it('purchase → we owe them (credit, negative balance)', () => {
    const r = computeStatement([d('2026-07-01', 'invoiceIn', -50n)]);
    expect(r.lines[0]?.side).toBe('credit');
    expect(r.finalBalanceMinor).toBe(-50n); // we owe them 50
  });

  it('sorts by moment regardless of input order', () => {
    const r = computeStatement([
      d('2026-07-03', 'cashIn', -30n),
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'invoiceOut', 20n),
    ]);
    expect(r.lines.map((l) => l.docType)).toEqual(['invoiceOut', 'invoiceOut', 'cashIn']);
    expect(r.lines.map((l) => l.runningBalanceMinor)).toEqual([100n, 120n, 90n]);
    expect(r.finalBalanceMinor).toBe(90n);
  });

  it('mixed full cycle settles to zero', () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 100n),
      d('2026-07-02', 'invoiceIn', -40n),
      d('2026-07-03', 'cashIn', -100n),
      d('2026-07-04', 'cashOut', 40n),
    ]);
    // +100 −40 −100 +40 = 0
    expect(r.finalBalanceMinor).toBe(0n);
    expect(r.turnoverMinor).toBe(280n);
  });

  it("nol delta ham qator bo'lib qoladi (kredit tomonda, 0 summa bilan)", () => {
    const r = computeStatement([d('2026-07-01', 'adjustment', 0n)]);
    expect(r.lines).toHaveLength(1);
    expect(r.finalBalanceMinor).toBe(0n);
  });
});

/**
 * FAZA Q6 (`PERF-02`) — DAVR-BOSHI SALDO (saldo-forward).
 *
 * Davr-filtri qo'shilgach akt endi butun tarixni ko'rsatmaydi, shuning uchun
 * davrgacha to'plangan qoldiq ALOHIDA kiritma bo'lib keladi (`foldJournalPeriod`
 * dan). Running balans undan boshlanishi SHART — aks holda davr aktidagi
 * «Qoldiq» ustuni bosh daftardan ajralib ketardi (aynan Faza 10 yopgan
 * bug-klassning davr-varianti).
 */
describe('computeStatement — davr-boshi saldo (Faza Q6)', () => {
  it('opening qatorlarsiz ham berilgan boshlang’ich qoldiqdan boshlanadi', () => {
    const r = computeStatement([d('2026-07-05', 'cashIn', -300n)], 1_000n);
    expect(r.openingMinor).toBe(1_000n);
    expect(r.lines[0]?.runningBalanceMinor).toBe(700n);
    expect(r.finalBalanceMinor).toBe(700n);
    // Aylanma FAQAT davr harakatlari — boshlang'ich qoldiq unga kirmaydi.
    expect(r.turnoverMinor).toBe(300n);
  });

  it('opening + debet − kredit == yakun (ichki izchillik)', () => {
    const r = computeStatement(
      [d('2026-07-01', 'invoiceOut', 500n), d('2026-07-02', 'paymentIn', -200n)],
      -100n,
    );
    expect(r.openingMinor + r.totalDebitMinor - r.totalCreditMinor).toBe(r.finalBalanceMinor);
    expect(r.finalBalanceMinor).toBe(200n);
  });

  it('boshlang’ich qoldiq berilmasa — nol (eski xulq saqlanadi)', () => {
    const r = computeStatement([d('2026-07-01', 'invoiceOut', 100n)]);
    expect(r.openingMinor).toBe(0n);
    expect(r.finalBalanceMinor).toBe(100n);
  });
});

/**
 * Faza 10 gacha bu bo'lim «akt-sverkaga QO'SHILGAN 5 tur» deb nomlanardi —
 * ya'ni ro'yxatning to'liqligini tekshirardi. Endi tekshiriladigan narsa
 * boshqa: HAR QANDAY tur (ro'yxatda bor-yo'qligidan qat'i nazar) o'z belgisi
 * bilan qatorga tushadi. Shu sababli ro'yxatda hech qachon bo'lmagan turlar —
 * `debt` (QRZ- ochildi), `retailsale` (POS qarzga sotuv), `opening` (tarixiy
 * qoldiq) va butunlay NOMA'LUM tur — ataylab qo'shilgan.
 */
describe('computeStatement — tur ro’yxatiga bog’liq EMAS (DUP-08 qulfi)', () => {
  it("noma'lum tur ham qatorga tushadi va saldoga qo'shiladi", () => {
    const r = computeStatement([
      d('2026-07-01', 'invoiceOut', 1000n),
      d('2026-07-02', 'kelajakdagi-yangi-tur', -400n),
    ]);
    expect(r.lines).toHaveLength(2);
    expect(r.finalBalanceMinor).toBe(600n);
  });

  it("noma'lum tur yorlig'i — turning o'zi (qator raqamsiz emas, nomsiz emas)", () => {
    expect(docTypeLabel('invoiceOut')).toBe('Sotuv');
    expect(docTypeLabel('debt')).toBe('Qarz ochildi');
    expect(docTypeLabel('kelajakdagi-yangi-tur')).toBe('kelajakdagi-yangi-tur');
  });

  it("to'liq aralash tsikl — Faza 9 ning 13 yozuvchisi + opening birga", () => {
    const r = computeStatement([
      d('2026-06-30', 'opening', 250n), //     +250 (tarixiy qoldiq)
      d('2026-07-01', 'invoiceOut', 1000n), // +1000
      d('2026-07-02', 'invoiceIn', -200n), //   −200
      d('2026-07-03', 'supply', -300n), //      −300
      d('2026-07-04', 'cashOut', 100n), //      +100
      d('2026-07-05', 'cashIn', -150n), //      −150
      d('2026-07-06', 'paymentOut', 250n), //   +250
      d('2026-07-07', 'paymentIn', -400n), //   −400
      d('2026-07-08', 'prepayment', -500n), //  −500
      d('2026-07-09', 'prepaymentReturn', 500n), // +500
      d('2026-07-10', 'adjustment', 200n), //   +200
      d('2026-07-11', 'adjustment', -300n), //  −300
      d('2026-07-12', 'debtpayment', -700n), // −700
      d('2026-07-13', 'debt', 900n), //         +900
      d('2026-07-14', 'retailsale', 75n), //     +75
    ]);
    // 250+1000−200−300+100−150+250−400−500+500+200−300−700+900+75 = 725
    expect(r.finalBalanceMinor).toBe(725n);
    expect(r.lines).toHaveLength(15);
  });
});

/**
 * A3 (2026-08-25) — AVANS TURLARINING YORLIG'I Excel aktida ham bor.
 *
 * Bu — reja A3 vazifasi 3 dagi «doc-type xaritalari, 3 joyda» ning uchinchi
 * joyi: POS kartasi va akt-sverka sahifasi WEB tomonda, bu esa SERVER
 * tomonda (Excel eksporti `docTypeLabel()` dan yuradi).
 *
 * Saldoga aloqasi YO'Q (Faza 10 shartnomasi): xarita faqat yorliq. Lekin
 * yorliqsiz qator «customerPrepayRefund» degan xom satr bilan chiqardi va
 * mijozga yuboriladigan aktda shu ko'rinardi.
 */
describe('A3 — avans turlarining Excel yorliqlari', () => {
  it('uchala tur ham o`z yorlig`ini oladi (xom `docType` emas)', () => {
    expect(docTypeLabel('customerPrepay')).toBe('Avans (kassada qabul qilindi)');
    expect(docTypeLabel('salePrepay')).toBe("Avansdan to'lov");
    expect(docTypeLabel('customerPrepayRefund')).toBe('Avans naqd qaytarildi');
  });

  it('🔴 B2B `prepayment` bilan CHALKASHMAYDI (boshqa modul, boshqa ma`no)', () => {
    // `prepayment` — zakazga bog'langan B2B avansi; kassa avansi esa mijoz
    // BALANSIDA erkin turadi (reja §2.3 chegarasi).
    expect(docTypeLabel('customerPrepay')).not.toBe(docTypeLabel('prepayment'));
    expect(docTypeLabel('customerPrepayRefund')).not.toBe(docTypeLabel('prepaymentReturn'));
  });

  it('noma`lum tur HAMON o`zini qaytaradi (qator yo`qolmaydi)', () => {
    expect(docTypeLabel('yangiTur')).toBe('yangiTur');
  });
});
