import { describe, expect, it } from 'vitest';
import {
  CASH_IN_EVENT,
  CASH_IN_KIND,
  cashInLedgerLabel,
  cashInPrefix,
  planCashInAuditEvents,
  summarizeCashIn,
  validateCashIn,
} from './pos-cash-in.js';
import { CASH_OUT_KIND, summarizeCashOut } from './pos-cash-out.js';

/**
 * A1 — kassaga pul KIRISHI qoidalari (sof modul).
 *
 * Qulflanadigan shartnomalar:
 *  1. mijozsiz avans va mijozli «Внесение» — ikkalasi ham BUZUQ hujjat;
 *  2. avans raqami «Внесение» dan AJRATILGAN (`АВ-` ≠ `ВН-`);
 *  3. audit izi FAQAT avansda yoziladi va nomlar MUZLATILGAN;
 *  4. `balanceBeforeMinor`: `null` (o'lchanmagan) ≠ `0n` (haqiqatan nol);
 *  5. Z-hisobot guruhlashi — `totalMinor` doim uchtasining yig'indisi
 *     (`collectCashInputs.drawerInMinor` bilan teng bo'lishi shart).
 */

describe('validateCashIn — hujjatning O`ZI to`g`rimi', () => {
  it('to`g`ri avans: muammo YO`Q', () => {
    expect(
      validateCashIn({
        kind: CASH_IN_KIND.customerPrepay,
        sumMinor: 100_000n,
        counterpartyId: 'cp-1',
      }),
    ).toEqual([]);
  });

  it('to`g`ri «Внесение»: kontragentsiz — muammo YO`Q', () => {
    expect(validateCashIn({ kind: CASH_IN_KIND.topup, sumMinor: 50_000n })).toEqual([]);
  });

  it('MIJOZSIZ avans — balansga yozib bo`lmaydi, 400', () => {
    const p = validateCashIn({ kind: CASH_IN_KIND.customerPrepay, sumMinor: 100_000n });
    expect(p).toHaveLength(1);
    expect(p[0]?.field).toBe('counterpartyId');
  });

  it('MIJOZLI «Внесение» — chalkash hujjat, 400', () => {
    const p = validateCashIn({
      kind: CASH_IN_KIND.topup,
      sumMinor: 100_000n,
      counterpartyId: 'cp-1',
    });
    expect(p).toHaveLength(1);
    expect(p[0]?.field).toBe('counterpartyId');
  });

  it('nol va manfiy summa — 400', () => {
    for (const sumMinor of [0n, -1n]) {
      const p = validateCashIn({
        kind: CASH_IN_KIND.customerPrepay,
        sumMinor,
        counterpartyId: 'cp-1',
      });
      expect(p.map((x) => x.field)).toContain('sumMinor');
    }
  });

  it('HAR muammo alohida qaytadi — kassir bir yuborishda hammasini ko`radi', () => {
    // Mijozsiz VA nol summali avans: ikkala muammo ham.
    const p = validateCashIn({ kind: CASH_IN_KIND.customerPrepay, sumMinor: 0n });
    expect(p.map((x) => x.field).sort()).toEqual(['counterpartyId', 'sumMinor']);
  });
});

describe('cashInPrefix — raqamdan turi ko`rinsin', () => {
  it('avans АВ-, «Внесение» ВН- — AJRATILGAN', () => {
    expect(cashInPrefix(CASH_IN_KIND.customerPrepay, 2026)).toBe('АВ-2026-');
    expect(cashInPrefix(CASH_IN_KIND.topup, 2026)).toBe('ВН-2026-');
    expect(cashInPrefix(CASH_IN_KIND.other, 2026)).toBe('ВН-2026-');
  });

  it('avans prefiksi «Внесение» niki bilan MOS EMAS (raqamlar aralashmasin)', () => {
    expect(cashInPrefix(CASH_IN_KIND.customerPrepay, 2026)).not.toBe(
      cashInPrefix(CASH_IN_KIND.topup, 2026),
    );
  });
});

describe('cashInLedgerLabel — /money lentasidagi yagona farqlovchi', () => {
  it('avans va «Внесение» boshqa-boshqa matn', () => {
    expect(cashInLedgerLabel(CASH_IN_KIND.customerPrepay)).toBe('Mijoz avansi');
    expect(cashInLedgerLabel(CASH_IN_KIND.topup)).toBe('Внесение');
    expect(cashInLedgerLabel(CASH_IN_KIND.other)).toBe('Внесение');
  });
});

describe('planCashInAuditEvents — kim, qancha, qachon qoldirdi', () => {
  const base = {
    docId: 'doc-1',
    docName: 'АВ-2026-00001',
    sumMinor: 100_000n,
    counterpartyId: 'cp-1',
    counterpartyName: 'Mijoz Testov',
  };

  it('avans → CUSTOMER_PREPAY, nomlar MUZLATIB yozilgan', () => {
    const events = planCashInAuditEvents({ ...base, kind: CASH_IN_KIND.customerPrepay });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(CASH_IN_EVENT.customerPrepay);
    expect(events[0]?.docId).toBe('doc-1');
    expect(events[0]?.payload).toMatchObject({
      name: 'АВ-2026-00001',
      kind: 'customer_prepay',
      sumMinor: '100000',
      counterpartyId: 'cp-1',
      counterpartyName: 'Mijoz Testov',
    });
  });

  it('«Внесение» → hodisa YOZILMAYDI (texnik amal, naqd formulasida ko`rinadi)', () => {
    expect(
      planCashInAuditEvents({ ...base, kind: CASH_IN_KIND.topup, counterpartyId: null }),
    ).toEqual([]);
  });

  it('balanceBeforeMinor: 0n → "0", null → null (aralashmaydi)', () => {
    const zero = planCashInAuditEvents({
      ...base,
      kind: CASH_IN_KIND.customerPrepay,
      balanceBeforeMinor: 0n,
    });
    expect(zero[0]?.payload.balanceBeforeMinor).toBe('0');

    const unknown = planCashInAuditEvents({
      ...base,
      kind: CASH_IN_KIND.customerPrepay,
      balanceBeforeMinor: null,
    });
    expect(unknown[0]?.payload.balanceBeforeMinor).toBeNull();

    const absent = planCashInAuditEvents({ ...base, kind: CASH_IN_KIND.customerPrepay });
    expect(absent[0]?.payload.balanceBeforeMinor).toBeNull();
  });

  it('QARZDOR mijozning avansi ham yoziladi (balans musbat edi)', () => {
    const events = planCashInAuditEvents({
      ...base,
      kind: CASH_IN_KIND.customerPrepay,
      balanceBeforeMinor: 300_000n,
    });
    expect(events[0]?.payload.balanceBeforeMinor).toBe('300000');
  });

  it('izoh berilsa payloadga kiradi, berilmasa kalit UMUMAN yo`q', () => {
    const withNote = planCashInAuditEvents({
      ...base,
      kind: CASH_IN_KIND.customerPrepay,
      description: 'ertaga kabel oladi',
    });
    expect(withNote[0]?.payload.description).toBe('ertaga kabel oladi');
    expect(
      Object.hasOwn(
        planCashInAuditEvents({ ...base, kind: CASH_IN_KIND.customerPrepay })[0]?.payload ?? {},
        'description',
      ),
    ).toBe(false);
  });
});

describe('summarizeCashIn — Z-hisobot guruhlashi', () => {
  it('uch tur alohida, jami — yig`indisi', () => {
    const s = summarizeCashIn([
      { kind: CASH_IN_KIND.topup, sumMinor: 10_000n },
      { kind: CASH_IN_KIND.customerPrepay, sumMinor: 100_000n },
      { kind: CASH_IN_KIND.customerPrepay, sumMinor: 50_000n },
      { kind: CASH_IN_KIND.other, sumMinor: 7_000n },
    ]);
    expect(s.topupMinor).toBe(10_000n);
    expect(s.customerPrepayMinor).toBe(150_000n);
    expect(s.otherMinor).toBe(7_000n);
    expect(s.totalMinor).toBe(167_000n);
  });

  it('NOMA`LUM tur — `other` ga tushadi, jamidan YO`QOLMAYDI', () => {
    // Kelajakda kimdir yangi `kind` yozib bu modulni yangilashni unutsa,
    // pul hisobotdan tushib qolmasligi kerak: `drawerInMinor` bilan
    // farq chiqishi «jim yo'qotish» dan ancha yaxshi.
    const s = summarizeCashIn([{ kind: 'kelajakdagi_tur', sumMinor: 42n }]);
    expect(s.otherMinor).toBe(42n);
    expect(s.totalMinor).toBe(42n);
  });

  it('bo`sh smena — hammasi nol', () => {
    const s = summarizeCashIn([]);
    expect(s).toMatchObject({
      topupMinor: 0n,
      customerPrepayMinor: 0n,
      otherMinor: 0n,
      totalMinor: 0n,
    });
  });

  it('AVANS `other` ga tushib ketmaydi — «qancha mijoz puli» javobsiz qolmasin', () => {
    const s = summarizeCashIn([{ kind: CASH_IN_KIND.customerPrepay, sumMinor: 100_000n }]);
    expect(s.otherMinor).toBe(0n);
    expect(s.customerPrepayMinor).toBe(100_000n);
  });
});

describe('kirim ↔ chiqim SIMMETRIYASI (bir tomonda tur qo`shildi, ikkinchisida unutildi)', () => {
  it('ikkala tasnif ham `other` ni oxirgi chelak sifatida ishlatadi', () => {
    expect(CASH_IN_KIND.other).toBe(CASH_OUT_KIND.other);
    expect(summarizeCashIn([{ kind: 'x', sumMinor: 5n }]).otherMinor).toBe(5n);
    expect(summarizeCashOut([{ kind: 'x', sumMinor: 5n }]).otherMinor).toBe(5n);
  });

  it('ikkala jami ham BARCHA qatorlarni qamraydi (yo`qolgan tur yo`q)', () => {
    const rows = [
      { kind: CASH_IN_KIND.topup, sumMinor: 1n },
      { kind: CASH_IN_KIND.customerPrepay, sumMinor: 2n },
      { kind: 'noma`lum', sumMinor: 4n },
    ];
    expect(summarizeCashIn(rows).totalMinor).toBe(rows.reduce((acc, r) => acc + r.sumMinor, 0n));
  });
});
