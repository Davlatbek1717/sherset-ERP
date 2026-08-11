import { describe, expect, it } from 'vitest';
import { planOpeningBackfill } from './opening-backfill-plan.js';

/**
 * P2 — «BOSHLANG'ICH QOLDIQ» BACKFILL REJASI (sof qoida).
 *
 * Skript prod DB'ga 203 qator yozadi (2026-08-11 DRY o'lchovi), shuning uchun
 * uning YURAGI — «nima yoziladi» qarori — I/O'siz, testda qulflangan bo'lishi
 * shart. 🔴 Sabog'i `cell-migration-delta-not-total` xotirasidan: backfill
 * FARQ bo'yicha ishlaydi, JAMI bo'yicha emas — aks holda ikkinchi yugurtirish
 * saldoni ikkilantiradi.
 *
 * Invariant (butun fazaning asosi):
 *
 *     backfilldan keyin  Σ(jurnal)  ==  CounterpartyBalance.balanceMinor
 *
 * ya'ni kartadagi raqam va uning tarixi bir daftardan chiqadi.
 */

const A = 'acc-1';

const bal = (cp: string, balanceMinor: bigint, currency = 'UZS') => ({
  accountId: A,
  counterpartyId: cp,
  currency,
  balanceMinor,
});

describe('P2 — planOpeningBackfill: farq bo`yicha, jami bo`yicha EMAS', () => {
  it('jurnal bo`sh bo`lsa butun qoldiq `opening` bo`lib yoziladi', () => {
    const plan = planOpeningBackfill([bal('c1', 500_000n)], []);

    expect(plan.entries).toEqual([
      { accountId: A, counterpartyId: 'c1', currency: 'UZS', deltaMinor: 500_000n },
    ]);
    expect(plan.matchedCount).toBe(0);
  });

  it('🔴 IDEMPOTENT — ikkinchi yugurtirishda hech narsa yozilmaydi', () => {
    const first = planOpeningBackfill([bal('c1', 500_000n)], []);
    // Birinchi yugurtirish natijasini jurnalga qo'shib, qaytadan rejalashtiramiz.
    const second = planOpeningBackfill(
      [bal('c1', 500_000n)],
      first.entries.map((e) => ({ ...e, sumMinor: e.deltaMinor })),
    );

    expect(second.entries).toEqual([]);
    expect(second.matchedCount).toBe(1);
  });

  it('jurnalda HAQIQIY deltalar bor bo`lsa faqat FARQ yoziladi', () => {
    // P1 ning sinov to'lovi kabi: jurnalda −1 000 turibdi, balans 499 000.
    const plan = planOpeningBackfill(
      [bal('c1', 499_000n)],
      [{ accountId: A, counterpartyId: 'c1', currency: 'UZS', sumMinor: -1_000n }],
    );

    expect(plan.entries[0]?.deltaMinor).toBe(500_000n);
  });

  it('MANFIY qoldiq (biz qarzdormiz) ham yoziladi — belgi saqlanadi', () => {
    const plan = planOpeningBackfill([bal('c1', -183_250_000n)], []);
    expect(plan.entries[0]?.deltaMinor).toBe(-183_250_000n);
  });

  it('valyuta kesimi ARALASHMAYDI', () => {
    const plan = planOpeningBackfill(
      [bal('c1', 500_000n, 'UZS'), bal('c1', 900n, 'USD')],
      [{ accountId: A, counterpartyId: 'c1', currency: 'UZS', sumMinor: 500_000n }],
    );

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({ currency: 'USD', deltaMinor: 900n });
  });

  it('nol qoldiq uchun qator YOZILMAYDI (shovqin qo`shmaymiz)', () => {
    const plan = planOpeningBackfill([bal('c1', 0n)], []);
    expect(plan.entries).toEqual([]);
  });
});

describe('P2 — planOpeningBackfill: teskari drift va jamlar', () => {
  it('jurnalda bor, materiallashganda YO`Q kalit YETIM deb belgilanadi', () => {
    const plan = planOpeningBackfill(
      [bal('c1', 500_000n)],
      [{ accountId: A, counterpartyId: 'yoq', currency: 'UZS', sumMinor: 7n }],
    );

    expect(plan.orphanJournalKeys).toEqual(['acc-1|yoq|UZS']);
  });

  it('yoziladigan deltalar YIG`INDISI hisobotga chiqadi', () => {
    const plan = planOpeningBackfill([bal('c1', 500_000n), bal('c2', -200_000n)], []);

    expect(plan.entries).toHaveLength(2);
    expect(plan.totalDeltaMinor).toBe(300_000n);
  });

  it('🔴 REJA INVARIANTI: har kalit uchun jurnal + reja == balans', () => {
    const balances = [bal('c1', 500_000n), bal('c2', -200_000n), bal('c3', 0n)];
    const journal = [{ accountId: A, counterpartyId: 'c1', currency: 'UZS', sumMinor: 120_000n }];
    const plan = planOpeningBackfill(balances, journal);

    for (const b of balances) {
      const k = `${b.accountId}|${b.counterpartyId}|${b.currency}`;
      const before = journal.find((j) => `${j.accountId}|${j.counterpartyId}|${j.currency}` === k);
      const added = plan.entries.find(
        (e) => `${e.accountId}|${e.counterpartyId}|${e.currency}` === k,
      );
      expect((before?.sumMinor ?? 0n) + (added?.deltaMinor ?? 0n)).toBe(b.balanceMinor);
    }
  });
});
