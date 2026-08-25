import { describe, expect, it } from 'vitest';
import {
  CASH_OUT_EVENT,
  CASH_OUT_KIND,
  cashOutLedgerLabel,
  cashOutPrefix,
  planCashOutAuditEvents,
  summarizeCashOut,
  validateCashOut,
} from './pos-cash-out.js';

describe('validateCashOut — hujjat o`zi to`g`rimi', () => {
  const ok = { kind: CASH_OUT_KIND.expense, sumMinor: 50_000n, expenseItemId: 'ei-1' };

  it('to`g`ri xarajat muammosiz o`tadi', () => {
    expect(validateCashOut(ok)).toEqual([]);
  });

  it('moddasiz xarajat rad etiladi', () => {
    // Moddasiz xarajat = «pul ketdi, nimaga noma'lum»; Z-hisobotdagi
    // moddalar kesimi uni ko'rsata olmaydi.
    const p = validateCashOut({ ...ok, expenseItemId: null });
    expect(p.map((x) => x.field)).toContain('expenseItemId');
  });

  it('qabul qiluvchisiz inkassatsiya rad etiladi', () => {
    const p = validateCashOut({ kind: CASH_OUT_KIND.collection, sumMinor: 1n });
    expect(p.map((x) => x.field)).toContain('recipientId');
  });

  it('nol va manfiy summa rad etiladi', () => {
    expect(validateCashOut({ ...ok, sumMinor: 0n }).map((x) => x.field)).toContain('sumMinor');
    expect(validateCashOut({ ...ok, sumMinor: -1n }).map((x) => x.field)).toContain('sumMinor');
  });

  it('HAMMA muammo birdan qaytadi, birinchisida to`xtamaydi', () => {
    // Aks holda kassir summani tuzatib qaytarardi va «modda ham yo'q»
    // xabarini endi ko'rardi.
    const p = validateCashOut({ kind: CASH_OUT_KIND.expense, sumMinor: 0n });
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.field).sort()).toEqual(['expenseItemId', 'sumMinor']);
  });

  it('chalkash hujjat rad etiladi: inkassatsiyaga xarajat moddasi', () => {
    // Aks holda Z-hisobotda ham moddalar kesimiga, ham inkassatsiyaga
    // tushib ikki marta o'qilardi.
    const p = validateCashOut({
      kind: CASH_OUT_KIND.collection,
      sumMinor: 10n,
      recipientId: 'e-1',
      expenseItemId: 'ei-1',
    });
    expect(p.map((x) => x.field)).toContain('expenseItemId');
  });

  it('chalkash hujjat rad etiladi: xarajatga qabul qiluvchi', () => {
    const p = validateCashOut({ ...ok, recipientId: 'e-1' });
    expect(p.map((x) => x.field)).toContain('recipientId');
  });
});

describe('cashOutPrefix — tur hujjat nomidan ko`rinadi', () => {
  it('har tur o`z prefiksini oladi', () => {
    expect(cashOutPrefix(CASH_OUT_KIND.expense, 2026)).toBe('РКО-2026-');
    expect(cashOutPrefix(CASH_OUT_KIND.collection, 2026)).toBe('ИНК-2026-');
    expect(cashOutPrefix(CASH_OUT_KIND.other, 2026)).toBe('ИЗ-2026-');
  });

  it('prefikslar bir-biriga o`xshamaydi (raqam navbati aralashmasin)', () => {
    const all = [CASH_OUT_KIND.expense, CASH_OUT_KIND.collection, CASH_OUT_KIND.other].map((k) =>
      cashOutPrefix(k, 2026),
    );
    expect(new Set(all).size).toBe(3);
  });
});

describe('planCashOutAuditEvents — §9 izi', () => {
  const base = { docId: 'd-1', docName: 'РКО-2026-00001', sumMinor: 30_000n };

  it('xarajat modda nomi bilan yoziladi', () => {
    const ev = planCashOutAuditEvents({
      ...base,
      kind: CASH_OUT_KIND.expense,
      expenseItemId: 'ei-1',
      expenseItemName: 'Transport',
      cashBeforeMinor: 500_000n,
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]?.type).toBe(CASH_OUT_EVENT.expense);
    expect(ev[0]?.payload.expenseItemName).toBe('Transport');
    expect(ev[0]?.payload.sumMinor).toBe('30000');
  });

  it('inkassatsiya qabul qiluvchi bilan yoziladi', () => {
    const ev = planCashOutAuditEvents({
      ...base,
      kind: CASH_OUT_KIND.collection,
      recipientId: 'e-9',
      recipientName: 'Menejer Aliyev',
      cashBeforeMinor: 500_000n,
    });
    expect(ev[0]?.type).toBe(CASH_OUT_EVENT.collection);
    expect(ev[0]?.payload.recipientName).toBe('Menejer Aliyev');
  });

  it('yashiqdagidan ko`p chiqarilsa QO`SHIMCHA hodisa — lekin to`xtatilmaydi', () => {
    // Q10: kassir erkin. Tashqi pul kiritilgan bo'lishi mumkin, bloklash
    // haqiqiy ishni buzardi — lekin menejer buni ko'rishi shart.
    const ev = planCashOutAuditEvents({
      ...base,
      sumMinor: 100_000n,
      kind: CASH_OUT_KIND.expense,
      expenseItemId: 'ei-1',
      cashBeforeMinor: 40_000n,
    });
    expect(ev.map((e) => e.type)).toEqual([CASH_OUT_EVENT.expense, CASH_OUT_EVENT.overdrawn]);
    expect(ev[1]?.payload.shortByMinor).toBe('60000');
  });

  it('AYNAN yetganda ogohlantirish YO`Q (chegara xatosi)', () => {
    const ev = planCashOutAuditEvents({
      ...base,
      sumMinor: 40_000n,
      kind: CASH_OUT_KIND.expense,
      expenseItemId: 'ei-1',
      cashBeforeMinor: 40_000n,
    });
    expect(ev).toHaveLength(1);
  });

  it('noma`lum qoldiq (null) ogohlantirish BERMAYDI — noma`lum ≠ nol', () => {
    // `0n` deb qabul qilinsa har smena boshida soxta signal chiqardi.
    const ev = planCashOutAuditEvents({
      ...base,
      kind: CASH_OUT_KIND.expense,
      expenseItemId: 'ei-1',
      cashBeforeMinor: null,
    });
    expect(ev).toHaveLength(1);
  });

  it('bo`sh yashiq (0n) esa ogohlantiradi', () => {
    const ev = planCashOutAuditEvents({
      ...base,
      kind: CASH_OUT_KIND.collection,
      recipientId: 'e-1',
      cashBeforeMinor: 0n,
    });
    expect(ev.map((e) => e.type)).toContain(CASH_OUT_EVENT.overdrawn);
  });

  it('tasniflanmagan «other» asosiy hodisa yozmaydi', () => {
    const ev = planCashOutAuditEvents({
      ...base,
      kind: CASH_OUT_KIND.other,
      cashBeforeMinor: 500_000n,
    });
    expect(ev).toEqual([]);
  });
});

describe('summarizeCashOut — Z-hisobot guruhlash', () => {
  const rows = [
    { kind: 'expense', sumMinor: 30_000n, expenseItemId: 'ei-1', expenseItemName: 'Transport' },
    { kind: 'expense', sumMinor: 20_000n, expenseItemId: 'ei-1', expenseItemName: 'Transport' },
    { kind: 'expense', sumMinor: 70_000n, expenseItemId: 'ei-2', expenseItemName: 'Ovqat' },
    { kind: 'collection', sumMinor: 500_000n },
    { kind: 'other', sumMinor: 5_000n },
  ];

  it('turlar bo`yicha ajratadi', () => {
    const s = summarizeCashOut(rows);
    expect(s.expenseMinor).toBe(120_000n);
    expect(s.collectionMinor).toBe(500_000n);
    expect(s.otherMinor).toBe(5_000n);
  });

  it('jami = uchtasining yig`indisi (tasniflanmagan ham pul chiqishi)', () => {
    const s = summarizeCashOut(rows);
    expect(s.totalMinor).toBe(625_000n);
    expect(s.totalMinor).toBe(s.expenseMinor + s.collectionMinor + s.otherMinor);
  });

  it('bir modda qatorlari QO`SHILADI, ikki marta chiqmaydi', () => {
    const s = summarizeCashOut(rows);
    const transport = s.byExpenseItem.find((i) => i.id === 'ei-1');
    expect(transport?.sumMinor).toBe(50_000n);
    expect(s.byExpenseItem).toHaveLength(2);
  });

  it('moddalar kesimi jami xarajatga TENG (qator yo`qolmaydi)', () => {
    const s = summarizeCashOut(rows);
    const sum = s.byExpenseItem.reduce((a, i) => a + i.sumMinor, 0n);
    expect(sum).toBe(s.expenseMinor);
  });

  it('moddasiz eski xarajat ham kesimda ko`rinadi (yig`indi mos qolsin)', () => {
    const s = summarizeCashOut([{ kind: 'expense', sumMinor: 9_000n }]);
    expect(s.byExpenseItem).toEqual([{ id: null, name: null, sumMinor: 9_000n }]);
    expect(s.byExpenseItem[0]?.sumMinor).toBe(s.expenseMinor);
  });

  it('kattadan kichikka saralanadi', () => {
    const s = summarizeCashOut(rows);
    expect(s.byExpenseItem.map((i) => i.id)).toEqual(['ei-2', 'ei-1']);
  });

  it('bo`sh ro`yxat nol beradi', () => {
    const s = summarizeCashOut([]);
    expect(s.totalMinor).toBe(0n);
    expect(s.byExpenseItem).toEqual([]);
  });

  it('2^53 dan katta summada aniq (BigInt yo`li)', () => {
    const big = 9_007_199_254_740_993n;
    const s = summarizeCashOut([
      { kind: 'expense', sumMinor: big, expenseItemId: 'ei-1' },
      { kind: 'expense', sumMinor: 1n, expenseItemId: 'ei-1' },
    ]);
    expect(s.expenseMinor).toBe(big + 1n);
  });
});

// ── A3 (2026-08-25): AVANSNI QAYTARISH turi ────────────────────────────────

describe('A3 — `prepay_refund` sof qoidalari', () => {
  it('raqam prefiksi `ВА-` — `АВ-` (kirim) ning JUFTI, alohida hisoblagich', () => {
    expect(cashOutPrefix(CASH_OUT_KIND.prepayRefund, 2026)).toBe('ВА-2026-');
    // Boshqa turlarnikidan farq qiladi ⇒ raqamlar bir-birini bosmaydi.
    const all = [
      CASH_OUT_KIND.expense,
      CASH_OUT_KIND.collection,
      CASH_OUT_KIND.returnPayout,
      CASH_OUT_KIND.prepayRefund,
      CASH_OUT_KIND.other,
    ].map((k) => cashOutPrefix(k, 2026));
    expect(new Set(all).size).toBe(all.length);
  });

  it('pul daftari izohi turni AYTADI («Изъятие» bo`lib qolmaydi)', () => {
    expect(cashOutLedgerLabel(CASH_OUT_KIND.prepayRefund)).toBe('Avans qaytarildi');
    expect(cashOutLedgerLabel(CASH_OUT_KIND.prepayRefund)).not.toBe(
      cashOutLedgerLabel(CASH_OUT_KIND.other),
    );
  });

  it('hujjat qoidalari: modda ham, qabul qiluvchi ham BO`LMAYDI', () => {
    expect(validateCashOut({ kind: CASH_OUT_KIND.prepayRefund, sumMinor: 50_000n })).toEqual([]);
    expect(
      validateCashOut({
        kind: CASH_OUT_KIND.prepayRefund,
        sumMinor: 50_000n,
        expenseItemId: 'ei-1',
      }),
    ).toHaveLength(1);
    expect(
      validateCashOut({
        kind: CASH_OUT_KIND.prepayRefund,
        sumMinor: 50_000n,
        recipientId: 'emp-1',
      }),
    ).toHaveLength(1);
    expect(validateCashOut({ kind: CASH_OUT_KIND.prepayRefund, sumMinor: 0n })).toHaveLength(1);
  });

  it('audit izi: mijoz nomi MUZLATIB, saldo qaytarishdan OLDINGI holatda', () => {
    const events = planCashOutAuditEvents({
      docId: 'doc-1',
      docName: 'ВА-2026-00001',
      kind: CASH_OUT_KIND.prepayRefund,
      sumMinor: 40_000n,
      agentId: 'cp-1',
      agentName: 'Mijoz Testov',
      balanceBeforeMinor: -100_000n,
      cashBeforeMinor: 500_000n,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('PREPAY_REFUND');
    expect(events[0]?.payload).toMatchObject({
      name: 'ВА-2026-00001',
      kind: 'prepay_refund',
      sumMinor: '40000',
      agentId: 'cp-1',
      agentName: 'Mijoz Testov',
      balanceBeforeMinor: '-100000',
    });
  });

  it('🔴 balans O`LCHANMAGAN bo`lsa auditda `null` — `0` EMAS', () => {
    const [ev] = planCashOutAuditEvents({
      docId: 'doc-1',
      docName: 'ВА-2026-00001',
      kind: CASH_OUT_KIND.prepayRefund,
      sumMinor: 10_000n,
      balanceBeforeMinor: null,
      cashBeforeMinor: 500_000n,
    });
    expect(ev?.payload.balanceBeforeMinor).toBeNull();
  });

  it('yashiqda pul yetmasa qo`shimcha `CASH_OVERDRAWN` (G1 bilan bir xil)', () => {
    const events = planCashOutAuditEvents({
      docId: 'doc-1',
      docName: 'ВА-2026-00001',
      kind: CASH_OUT_KIND.prepayRefund,
      sumMinor: 90_000n,
      cashBeforeMinor: 10_000n,
    });
    expect(events.map((e) => e.type)).toEqual(['PREPAY_REFUND', 'CASH_OVERDRAWN']);
  });

  it('🔴 Z-hisobotda O`Z QATORI — `other` ga tushmaydi', () => {
    const s = summarizeCashOut([
      { kind: 'prepay_refund', sumMinor: 40_000n },
      { kind: 'return_payout', sumMinor: 15_000n },
      { kind: 'other', sumMinor: 3_000n },
    ]);
    expect(s.prepayRefundMinor).toBe(40_000n);
    expect(s.returnPayoutMinor).toBe(15_000n);
    expect(s.otherMinor).toBe(3_000n);
    // Jami — uchalasining yig'indisi (naqddan chiqqan HAMMA pul).
    expect(s.totalMinor).toBe(58_000n);
  });

  it('turi yo`q smenada `prepayRefundMinor` NOL (maydon yo`qolmaydi)', () => {
    expect(summarizeCashOut([{ kind: 'expense', sumMinor: 5_000n }]).prepayRefundMinor).toBe(0n);
  });
});
