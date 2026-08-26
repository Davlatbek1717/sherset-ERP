/**
 * Q6 — jonli verify HUKMLARINING testi.
 *
 * 🔴 NEGA BU TEST BOR: P1 ning verify skriptida hukm shartlari skript ichida
 * yozilgan edi va ularning O'ZI hech qachon tekshirilmagan. Shart noto'g'ri
 * bo'lsa skript baribir «O'TDI» deb chiqadi — ya'ni jonli isbot YOLG'ON
 * bo'lishi mumkin. Shu sababdan Q6 da hukmlar sof funksiyaga chiqarildi va
 * har biri MUTATSIYA bilan sinaladi: to'g'ri o'lchov ✅, buzilgan o'lchov ❌.
 */
import { describe, expect, it } from 'vitest';
import {
  type LedgerSnapshot,
  type RegistryRowSnapshot,
  balanceDelta,
  codeFieldDetail,
  collectionDetail,
  isLiveVerifyPossible,
  planDebtChainVerdicts,
  planPrepayChainVerdicts,
  planReadiness,
  rowRemaining,
  summarizeVerdicts,
} from './q6-verify-plan.js';

const DUE = new Date('2026-09-08T04:00:00.000Z');

const row = (over: Partial<RegistryRowSnapshot> = {}): RegistryRowSnapshot => ({
  totalMinor: 100_000n,
  paidMinor: 0n,
  status: 'unpaid',
  balanceAdopted: true,
  nextContactAt: DUE,
  sourceDocType: 'retailsale',
  ...over,
});

const snap = (over: Partial<LedgerSnapshot> = {}): LedgerSnapshot => ({
  balanceMinor: 0n,
  row: null,
  inCollection: false,
  cashDeskMinor: 1_000_000n,
  journalRows: 0,
  ...over,
});

const byKey = (list: ReturnType<typeof planDebtChainVerdicts>, key: string) => {
  const found = list.find((v) => v.key === key);
  if (!found) throw new Error(`hukm topilmadi: ${key}`);
  return found;
};

// ────────────────────────────────────────────────── yordamchilar ────────────

describe('rowRemaining / balanceDelta', () => {
  it('qoldiq = total − paid', () => {
    expect(rowRemaining(row({ totalMinor: 100_000n, paidMinor: 20_000n }))).toBe(80_000n);
  });

  it('qator yo`q ⇒ qoldiq 0', () => {
    expect(rowRemaining(null)).toBe(0n);
  });

  it('to`lov total dan katta bo`lsa MANFIY qaytmaydi (nizo holati)', () => {
    expect(rowRemaining(row({ totalMinor: 10_000n, paidMinor: 30_000n }))).toBe(0n);
  });

  it('balans deltasi: ikkalasi ham o`lchanmagan ⇒ 0', () => {
    expect(balanceDelta(null, null)).toBe(0n);
  });

  it('🔴 biri o`lchanmagan ⇒ `null` (0 EMAS — o`lchab bo`lmaydi)', () => {
    expect(balanceDelta(null, 100n)).toBeNull();
    expect(balanceDelta(100n, null)).toBeNull();
  });

  it('oddiy delta', () => {
    expect(balanceDelta(50n, 130n)).toBe(80n);
  });
});

// ───────────────────────────────────────────────── QARZ ZANJIRI ─────────────

describe('planDebtChainVerdicts — oddiy holat (balans 0, chek to`liq qarzga)', () => {
  const debtMinor = 100_000n;
  const payMinor = 20_000n;
  const before = snap({ balanceMinor: 0n });
  const afterPost = snap({ balanceMinor: 100_000n, row: row(), inCollection: true });
  const afterPay = snap({
    balanceMinor: 80_000n,
    row: row({ paidMinor: 20_000n, status: 'partial' }),
    inCollection: true,
  });
  const afterRefund = snap({
    balanceMinor: 0n,
    row: row({ totalMinor: 20_000n, paidMinor: 20_000n, status: 'paid', nextContactAt: null }),
    inCollection: false,
  });
  const all = planDebtChainVerdicts({
    debtMinor,
    payMinor,
    before,
    afterPost,
    afterPay,
    afterRefund,
  });

  it('HAMMA hukm o`tadi', () => {
    expect(summarizeVerdicts(all).ok).toBe(true);
  });

  it('11 ta hukm chiqadi (zanjir to`liq o`lchanadi)', () => {
    expect(all).toHaveLength(11);
  });

  it('INVARIANT 1 — balans AYNAN chek qarzicha o`sgani tekshiriladi', () => {
    expect(byKey(all, 'inv1-balance-once').pass).toBe(true);
  });
});

describe('planDebtChainVerdicts — MUTATSIYALAR (buzilgan o`lchov ❌ berishi SHART)', () => {
  const base = {
    debtMinor: 100_000n,
    payMinor: 20_000n,
    before: snap({ balanceMinor: 0n }),
    afterPost: snap({ balanceMinor: 100_000n, row: row(), inCollection: true }),
    afterPay: snap({
      balanceMinor: 80_000n,
      row: row({ paidMinor: 20_000n, status: 'partial' }),
      inCollection: true,
    }),
    afterRefund: snap({
      balanceMinor: 0n,
      row: row({ totalMinor: 20_000n, paidMinor: 20_000n, status: 'paid', nextContactAt: null }),
      inCollection: false,
    }),
  };

  it('🔴 balans IKKI MARTA o`sgan bo`lsa invariant 1 YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, balanceMinor: 200_000n },
    });
    expect(byKey(v, 'inv1-balance-once').pass).toBe(false);
  });

  it('🔴 qator ochilmagan bo`lsa Q2 hukmi YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, row: null, inCollection: false },
    });
    expect(byKey(v, 'q2-row-opened').pass).toBe(false);
  });

  it('🔴 `balanceAdopted = false` bo`lsa YIQILADI (balansga qayta yozilardi)', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, row: row({ balanceAdopted: false }) },
    });
    expect(byKey(v, 'q2-balance-adopted').pass).toBe(false);
  });

  it('🔴 muddat NULL bo`lsa YIQILADI (eslatma cron`i ko`rmasdi)', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, row: row({ nextContactAt: null }) },
    });
    expect(byKey(v, 'q1-due-date').pass).toBe(false);
  });

  it('🔴 undirish ro`yxatida chiqmasa YIQILADI (egasining shikoyati)', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, inCollection: false },
    });
    expect(byKey(v, 'q4-collection').pass).toBe(false);
  });

  it('🔴 to`lovda faqat BITTA daftar kamaysa simmetriya YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPay: { ...base.afterPay, row: row() }, // reyestr kamaymadi
    });
    expect(byKey(v, 'p1-pay-symmetry').pass).toBe(false);
  });

  it('🔴 vozvratda reyestr qimirlamasa INVARIANT 2 YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterRefund: {
        ...base.afterRefund,
        row: row({ paidMinor: 20_000n, status: 'partial' }),
      },
    });
    expect(byKey(v, 'inv2-refund-symmetry').pass).toBe(false);
  });

  it('🔴 qaytarilgan chek ro`yxatda qolsa YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterRefund: { ...base.afterRefund, inCollection: true },
    });
    expect(byKey(v, 'q3-collection-gone').pass).toBe(false);
  });

  it('🔴 manba `retailsale` bo`lmasa YIQILADI (Q4 filtri shundan yuradi)', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, row: row({ sourceDocType: null }) },
    });
    expect(byKey(v, 'q2-source-doc').pass).toBe(false);
  });
});

describe('planDebtChainVerdicts — §2.2 KESISHUV (invariant 4)', () => {
  it('🔴 avans qarzdan KATTA ⇒ qator ochilMAGANI TO`G`RI hukm', () => {
    const v = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -500_000n }),
      afterPost: snap({ balanceMinor: -400_000n, row: null, inCollection: false }),
      afterPay: snap({ balanceMinor: -400_000n, row: null }),
      afterRefund: snap({ balanceMinor: -500_000n, row: null }),
    });
    expect(byKey(v, 'q2-row-opened').pass).toBe(true);
    expect(byKey(v, 'q4-collection').pass).toBe(true);
    expect(byKey(v, 'q2-row-amount').pass).toBe(true);
  });

  it('🔴 qator ochilmagan chekda INVARIANT 2 yolg`on QIZIL bermaydi (butun zanjir yashil)', () => {
    // Avans qoplagan chekda vozvrat balansni YOLG'IZ harakatlantiradi —
    // reyestr qatori umuman yo'q. Simmetriyani talab qilish yolg'on qizil
    // bo'lardi va keyingi sessiya haqiqiy signalni o'tkazib yuborardi.
    const v = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -500_000n }),
      afterPost: snap({ balanceMinor: -400_000n, row: null, inCollection: false }),
      afterPay: snap({ balanceMinor: -400_000n, row: null }),
      afterRefund: snap({ balanceMinor: -500_000n, row: null }),
    });
    expect(byKey(v, 'inv2-refund-symmetry').pass).toBe(true);
    expect(summarizeVerdicts(v).ok).toBe(true);
  });

  it('🔴 avansli mijozga qator OCHILGAN bo`lsa hukm YIQILADI', () => {
    const v = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -500_000n }),
      afterPost: snap({ balanceMinor: -400_000n, row: row(), inCollection: true }),
      afterPay: snap({ balanceMinor: -400_000n, row: row() }),
      afterRefund: snap({ balanceMinor: -500_000n, row: null }),
    });
    expect(byKey(v, 'q2-row-opened').pass).toBe(false);
    expect(byKey(v, 'q4-collection').pass).toBe(false);
  });

  it('avans QISMAN qoplagan ⇒ qator FAQAT qolgan qismga', () => {
    // balans −40 000, chek qarzi 100 000 ⇒ kutilgan qator 60 000.
    const ok = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -40_000n }),
      afterPost: snap({
        balanceMinor: 60_000n,
        row: row({ totalMinor: 60_000n }),
        inCollection: true,
      }),
      afterPay: snap({ balanceMinor: 60_000n, row: row({ totalMinor: 60_000n }) }),
      afterRefund: snap({ balanceMinor: -40_000n, row: null }),
    });
    expect(byKey(ok, 'q2-row-amount').pass).toBe(true);

    const bad = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -40_000n }),
      afterPost: snap({ balanceMinor: 60_000n, row: row({ totalMinor: 100_000n }) }),
      afterPay: snap({ balanceMinor: 60_000n, row: row({ totalMinor: 100_000n }) }),
      afterRefund: snap({ balanceMinor: -40_000n, row: null }),
    });
    expect(byKey(bad, 'q2-row-amount').pass).toBe(false);
  });

  it('🔴 kutilgan summa `receivablePortion` DAN olinadi — ikkinchi formula yozilmagan', () => {
    // Bu holat sodda «min(debt, balansKeyin)» formulasi bilan boshqacha
    // chiqardi; hukm Q1 ning sof qoidasi bilan mos kelishi SHART.
    const v = planDebtChainVerdicts({
      debtMinor: 300_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: -100_000n }),
      afterPost: snap({ balanceMinor: 200_000n, row: row({ totalMinor: 200_000n }) }),
      afterPay: snap({ balanceMinor: 200_000n, row: row({ totalMinor: 200_000n }) }),
      afterRefund: snap({ balanceMinor: -100_000n, row: null }),
    });
    expect(byKey(v, 'q2-row-amount').pass).toBe(true);
  });

  it('balans O`LCHANMAGAN ⇒ to`liq qator kutiladi, balans hukmi esa o`lchanmaydi', () => {
    const v = planDebtChainVerdicts({
      debtMinor: 100_000n,
      payMinor: 0n,
      before: snap({ balanceMinor: null }),
      afterPost: snap({ balanceMinor: 100_000n, row: row(), inCollection: true }),
      afterPay: snap({ balanceMinor: 100_000n, row: row() }),
      afterRefund: snap({ balanceMinor: null, row: null }),
    });
    expect(byKey(v, 'q2-row-amount').pass).toBe(true);
    // `null → 100 000` deltasi o'lchab bo'lmaydi ⇒ invariant 1 hukmi YIQILADI
    // (jim «o'tdi» EMAS — o'lchanmagan narsani isbot deb yozib bo'lmaydi).
    expect(byKey(v, 'inv1-balance-once').pass).toBe(false);
  });
});

// ──────────────────────────────────────────────── AVANS ZANJIRI ─────────────

describe('planPrepayChainVerdicts — to`liq oqim', () => {
  const base = {
    prepayMinor: 100_000n,
    saleMinor: 60_000n,
    overspendRejected: true,
    crossDebtMinor: 100_000n,
    crossPrepayMinor: 40_000n,
    before: snap({ balanceMinor: 0n, cashDeskMinor: 1_000_000n }),
    afterPrepay: snap({ balanceMinor: -100_000n, cashDeskMinor: 1_100_000n }),
    afterSpend: snap({ balanceMinor: -40_000n, cashDeskMinor: 1_100_000n }),
    spendReceiptFullyPaid: true,
    // avans 40 000 qoldi, chek 140 000 = 40 000 avans + 100 000 qarz
    afterCrossSale: snap({
      balanceMinor: 100_000n,
      cashDeskMinor: 1_100_000n,
      row: row({ totalMinor: 100_000n }),
      inCollection: true,
    }),
    afterRefund: snap({ balanceMinor: 0n, cashDeskMinor: 1_060_000n }),
  };
  const all = planPrepayChainVerdicts(base);

  it('HAMMA hukm o`tadi', () => {
    expect(summarizeVerdicts(all).ok).toBe(true);
  });

  it('10 ta hukm chiqadi', () => {
    expect(all).toHaveLength(10);
  });

  it('🔴 A1 kassaga pul KIRDI, balans MANFIY tomonga surildi', () => {
    expect(byKey(all, 'a1-cash-in').pass).toBe(true);
    expect(byKey(all, 'a1-balance-negative').pass).toBe(true);
  });

  it('🔴 INVARIANT 4 — avansdan `Debt` qatori tug`ilmadi', () => {
    expect(byKey(all, 'inv4-no-debt-row').pass).toBe(true);
  });

  it('🔴 A2 — kassa naqdi O`ZGARMADI (pul allaqachon kirgan)', () => {
    expect(byKey(all, 'a2-cash-unchanged').pass).toBe(true);
  });

  it('🔴 A2×Q2 KESISHUVI — qator 100 000 (40 000 EMAS)', () => {
    expect(byKey(all, 'a2-cross-registry').pass).toBe(true);
  });
});

describe('planPrepayChainVerdicts — MUTATSIYALAR', () => {
  const base = {
    prepayMinor: 100_000n,
    saleMinor: 60_000n,
    overspendRejected: true,
    crossDebtMinor: 100_000n,
    crossPrepayMinor: 40_000n,
    before: snap({ balanceMinor: 0n, cashDeskMinor: 1_000_000n }),
    afterPrepay: snap({ balanceMinor: -100_000n, cashDeskMinor: 1_100_000n }),
    afterSpend: snap({ balanceMinor: -40_000n, cashDeskMinor: 1_100_000n }),
    spendReceiptFullyPaid: true,
    afterCrossSale: snap({
      balanceMinor: 100_000n,
      cashDeskMinor: 1_100_000n,
      row: row({ totalMinor: 100_000n }),
      inCollection: true,
    }),
    afterRefund: snap({ balanceMinor: 0n, cashDeskMinor: 1_060_000n }),
  };

  it('🔴 avansdan to`lovda kassa QIMIRLASA YIQILADI (pul ikki marta kirardi)', () => {
    const v = planPrepayChainVerdicts({
      ...base,
      afterSpend: { ...base.afterSpend, cashDeskMinor: 1_160_000n },
    });
    expect(byKey(v, 'a2-cash-unchanged').pass).toBe(false);
  });

  it('🔴 avansdan `Debt` qatori tug`ilsa invariant 4 YIQILADI', () => {
    const v = planPrepayChainVerdicts({
      ...base,
      afterPrepay: { ...base.afterPrepay, row: row(), inCollection: true },
    });
    expect(byKey(v, 'inv4-no-debt-row').pass).toBe(false);
  });

  it('🔴 ortiqcha sarf 400 BERMASA invariant 5 YIQILADI', () => {
    const v = planPrepayChainVerdicts({ ...base, overspendRejected: false });
    expect(byKey(v, 'inv5-overspend-400').pass).toBe(false);
  });

  it('🔴 KESISHUVDA qator 40 000 bo`lsa YIQILADI (egasining shikoyati qaytardi)', () => {
    const v = planPrepayChainVerdicts({
      ...base,
      afterCrossSale: { ...base.afterCrossSale, row: row({ totalMinor: 40_000n }) },
    });
    expect(byKey(v, 'a2-cross-registry').pass).toBe(false);
  });

  it('🔴 chek TO`LANGAN sanalmasa YIQILADI (`DEBT` dan farq yo`qolardi)', () => {
    const v = planPrepayChainVerdicts({ ...base, spendReceiptFullyPaid: false });
    expect(byKey(v, 'a2-receipt-paid').pass).toBe(false);
  });

  it('🔴 qaytargandan keyin balans hamon MANFIY bo`lsa YIQILADI', () => {
    const v = planPrepayChainVerdicts({
      ...base,
      afterRefund: { ...base.afterRefund, balanceMinor: -40_000n },
    });
    expect(byKey(v, 'a3-balance-settled').pass).toBe(false);
  });
});

// ────────────────────────────────────────────────── YAKUNIY HUKM ────────────

describe('summarizeVerdicts', () => {
  it('hammasi o`tsa ok', () => {
    const s = summarizeVerdicts([
      { key: 'a', label: 'a', pass: true, detail: '' },
      { key: 'b', label: 'b', pass: true, detail: '' },
    ]);
    expect(s).toEqual({ total: 2, passed: 2, failed: 0, ok: true, failedKeys: [] });
  });

  it('bittasi yiqilsa ok EMAS va kaliti chiqadi', () => {
    const s = summarizeVerdicts([
      { key: 'a', label: 'a', pass: true, detail: '' },
      { key: 'b', label: 'b', pass: false, detail: '' },
    ]);
    expect(s.ok).toBe(false);
    expect(s.failedKeys).toEqual(['b']);
  });

  it('🔴 BO`SH ro`yxat «o`tdi» EMAS (zanjir yugurmagan bo`lsa yolg`on yozuv qolmasin)', () => {
    expect(summarizeVerdicts([]).ok).toBe(false);
  });
});

// ──────────────────────────── KESILGAN RO'YXAT (`inCollection = null`) ──────
//
// 🔴 NEGA ALOHIDA BLOK: `GET /manager/collection` javobni `COLLECTION_ROW_CAP
// = 500` da kesadi. Q5 backfill'idan keyin ro'yxat 500 dan oshadi (lokal
// o'lchov 579 → 812), ya'ni sinov qatori kesimdan tashqarida qolishi mumkin.
// «Topilmadi» ni «ro'yxatda yo'q» deb o'qish IKKI xil yolg'on berardi:
// qarz yo'lida yolg'on QIZIL, avans yo'lida yolg'on YASHIL. O'lchanmagan
// holat shu sababdan uchinchi qiymat va u hukmda XATO deb sanaladi.

describe("undirish ro'yxati KESILGAN bo`lsa — «yo`q» EMAS, «O`LCHANMADI»", () => {
  const base = {
    debtMinor: 100_000n,
    payMinor: 20_000n,
    before: snap({ balanceMinor: 0n }),
    afterPost: snap({ balanceMinor: 100_000n, row: row(), inCollection: true }),
    afterPay: snap({
      balanceMinor: 80_000n,
      row: row({ paidMinor: 20_000n, status: 'partial' }),
      inCollection: true,
    }),
    afterRefund: snap({
      balanceMinor: 0n,
      row: row({ totalMinor: 20_000n, paidMinor: 20_000n, status: 'paid', nextContactAt: null }),
      inCollection: false,
    }),
  };

  it('🔴 qarz yo`lida `null` ⇒ `q4-collection` YIQILADI (yolg`on yashil emas)', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterPost: { ...base.afterPost, inCollection: null },
    });
    expect(byKey(v, 'q4-collection').pass).toBe(false);
    expect(byKey(v, 'q4-collection').detail).toContain("O'LCHANMADI");
  });

  it('🔴 AVANS qoplagan chekda ham `null` ⇒ YIQILADI (kesim «chiqmadi» deb o`qilmaydi)', () => {
    // Bu eng nozik holat: kutilgan qator 0, ya'ni hukm «ro'yxatda BO'LMASIN»
    // deydi. Kesilgan ro'yxat buni bepul tasdiqlab qo'yardi.
    const v = planDebtChainVerdicts({
      ...base,
      before: snap({ balanceMinor: -400_000n }),
      afterPost: snap({ balanceMinor: -300_000n, row: null, inCollection: null }),
    });
    expect(byKey(v, 'q4-collection').pass).toBe(false);
  });

  it('🔴 vozvratdan keyin `null` ⇒ `q3-collection-gone` YIQILADI', () => {
    const v = planDebtChainVerdicts({
      ...base,
      afterRefund: { ...base.afterRefund, inCollection: null },
    });
    expect(byKey(v, 'q3-collection-gone').pass).toBe(false);
  });

  const prepayBase = {
    prepayMinor: 100_000n,
    saleMinor: 60_000n,
    overspendRejected: true,
    crossDebtMinor: 100_000n,
    crossPrepayMinor: 40_000n,
    before: snap({ balanceMinor: 0n, cashDeskMinor: 1_000_000n }),
    afterPrepay: snap({ balanceMinor: -100_000n, cashDeskMinor: 1_100_000n }),
    afterSpend: snap({ balanceMinor: -40_000n, cashDeskMinor: 1_100_000n }),
    spendReceiptFullyPaid: true,
    afterCrossSale: snap({
      balanceMinor: 100_000n,
      cashDeskMinor: 1_100_000n,
      row: row({ totalMinor: 100_000n }),
      inCollection: true,
    }),
    afterRefund: snap({ balanceMinor: 0n, cashDeskMinor: 1_060_000n }),
  };

  it('avans zanjirida `null` invariant 4 ni buzmaydi (qator YO`Qligi dalil)', () => {
    // Bu yerda ASOSIY dalil — `row === null`, ya'ni reyestrda qator umuman
    // tug'ilmagani. Ro'yxat kesilgani bu dalilni zaiflashtirmaydi; kesim
    // faqat «BOR» ni yashira olmaydi (`true` bo'lsa yiqiladi).
    const v = planPrepayChainVerdicts({
      ...prepayBase,
      afterPrepay: { ...prepayBase.afterPrepay, inCollection: null },
    });
    expect(byKey(v, 'inv4-no-debt-row').pass).toBe(true);
  });

  it('🔴 avans zanjirida ro`yxatda CHIQIB qolsa invariant 4 YIQILADI', () => {
    const v = planPrepayChainVerdicts({
      ...prepayBase,
      afterPrepay: { ...prepayBase.afterPrepay, inCollection: true, row: row() },
    });
    expect(byKey(v, 'inv4-no-debt-row').pass).toBe(false);
  });

  it('chiqish matni uch holatni AJRATADI', () => {
    expect(collectionDetail(true)).toBe('inCollection=true');
    expect(collectionDetail(false)).toBe('inCollection=false');
    expect(collectionDetail(null)).toContain('KESILGAN');
  });
});

// ─────────────────────────────────────────────── QAMROV (DRY rejim) ─────────

describe('planReadiness / isLiveVerifyPossible', () => {
  const full = {
    q1Columns: true,
    q4Column: true,
    a1Column: true,
    apiReachable: true,
    a2Field: true,
    a3Field: true,
    saleDebtRows: 12,
    backfillRows: 5,
  };

  it('hammasi joyida ⇒ jonli verify MUMKIN', () => {
    expect(isLiveVerifyPossible(full)).toBe(true);
    expect(planReadiness(full).every((l) => l.ready)).toBe(true);
  });

  it('🔴 migratsiya berilmagan ⇒ MUMKIN EMAS', () => {
    expect(isLiveVerifyPossible({ ...full, q1Columns: false })).toBe(false);
  });

  it('🔴 kod deploy qilinmagan (maydon yo`q) ⇒ MUMKIN EMAS', () => {
    expect(isLiveVerifyPossible({ ...full, a3Field: false })).toBe(false);
  });

  it('reyestrda kassa qatori yo`q bo`lsa qamrov qatori «tayyor emas» deydi', () => {
    const lines = planReadiness({ ...full, saleDebtRows: 0, backfillRows: 0 });
    const dataLine = lines.find((l) => l.phase.startsWith('Q2/Q5'));
    expect(dataLine?.ready).toBe(false);
  });

  it('🔴 ma`lumot qatori jonli verify SHARTI EMAS (bo`sh reyestrda ham yugurtiriladi)', () => {
    expect(isLiveVerifyPossible({ ...full, saleDebtRows: 0, backfillRows: 0 })).toBe(true);
  });

  // 🔴 LOKAL DRY YUGURISHIDA TOPILGAN CHALKASHLIK (2026-08-26). :4001 da
  // server ko'tarilmagan edi va jadval «A2/A3 kod deploy qilinmagan» deb
  // yozdi — aslida u hech nima O'LCHAMAGAN edi. Deploy kechasida bu xulosa
  // odamni butunlay boshqa ishga (qayta deploy) yuborardi.
  it('🔴 API javob bermasa — «kod yo`q» EMAS, «O`LCHANMADI» deyiladi', () => {
    const lines = planReadiness({ ...full, apiReachable: false, a2Field: false, a3Field: false });
    const a2 = lines.find((l) => l.phase.startsWith('A2'));
    expect(a2?.ready).toBe(false);
    expect(a2?.detail).toContain("O'LCHANMADI");
    expect(a2?.detail).not.toContain('deploy qilinmagan');
  });

  it('🔴 API javob berdi-yu maydon yo`q — O`SHANDA «deploy qilinmagan»', () => {
    const lines = planReadiness({ ...full, apiReachable: true, a3Field: false });
    const a3 = lines.find((l) => l.phase.startsWith('A3'));
    expect(a3?.detail).toContain('deploy qilinmagan');
  });

  it('🔴 API`ga yetib borilmasa `--live` MUMKIN EMAS', () => {
    expect(isLiveVerifyPossible({ ...full, apiReachable: false })).toBe(false);
  });

  it('matn uch holatni AJRATADI', () => {
    expect(codeFieldDetail(false, false)).toContain("O'LCHANMADI");
    expect(codeFieldDetail(true, false)).toContain('deploy qilinmagan');
    expect(codeFieldDetail(true, true)).toContain('BOR');
  });
});
