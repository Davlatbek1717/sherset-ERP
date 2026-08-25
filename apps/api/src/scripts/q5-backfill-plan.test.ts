/**
 * Q5 — backfill rejasining SOF qoidalari (reja §Q5, vazifa 5).
 *
 * Bu fayl BAZASIZ: butun taqsimot, sana zinapoyasi va o'tkazib yuborish
 * qoidalari shu yerda muzlatiladi. Skript (`ops-q5-backfill-sale-debts.ts`)
 * faqat I/O — u testda emas, LOKAL BAZADA sinaladi (qoida 7).
 *
 * 🔴 Eng muhim uch invariant shu yerda qulflanadi:
 *  1. reyestrga ochiladigan JAMI summa kontragentning reyestrdan
 *     TASHQARIDAGI qarzidan (cap) hech qachon oshmaydi;
 *  2. tartib YANGISIDAN ESKISIGA va DETERMINISTIK — ikki DRY-RUN bir xil
 *     ro'yxat beradi (egasi tasdiqlagan ro'yxat `--apply` da o'zgarmaydi);
 *  3. muddat chek sanasidan EMAS, `now` dan zinapoyali — hamma qator birdan
 *     `overdue` bo'lib eslatma cron'ini to'ldirmaydi.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALE_DEBT_TERM_DAYS,
  saleDebtComment,
  saleDebtDueAt,
} from '../modules/debt/sale-debt-registry.js';
import {
  type Q5CounterpartyInput,
  type Q5Receipt,
  Q5_BACKFILL_MARKER,
  planCounterpartyBackfill,
  planQ5Backfill,
  q5BackfillMarker,
  q5CounterpartyCap,
  q5ReceiptRemaining,
  q5StaircaseDays,
} from './q5-backfill-plan.js';

const NOW = new Date('2026-08-25T10:00:00.000Z');
const RUN = '2026-08-25-01';

function receipt(over: Partial<Q5Receipt> & Pick<Q5Receipt, 'saleId'>): Q5Receipt {
  return {
    saleName: `CHK-${over.saleId}`,
    postedAt: new Date('2026-08-01T00:00:00.000Z'),
    debtAmountMinor: 100_000n,
    debtReturnedMinor: 0n,
    alreadyRegistered: false,
    ...over,
  };
}

function cp(over: Partial<Q5CounterpartyInput> = {}): Q5CounterpartyInput {
  return {
    counterpartyId: 'cp-1',
    counterpartyName: 'Sinov mijoz',
    balanceMinor: 100_000n,
    registryOutstandingMinor: 0n,
    receipts: [receipt({ saleId: 's1' })],
    ...over,
  };
}

describe('q5ReceiptRemaining — qaytarilgan qism qarz emas', () => {
  it('qaytarish yo`q bo`lsa to`liq qarz', () => {
    expect(q5ReceiptRemaining(receipt({ saleId: 's', debtAmountMinor: 300n }))).toBe(300n);
  });

  it('qisman qaytarish ayiriladi', () => {
    expect(
      q5ReceiptRemaining(receipt({ saleId: 's', debtAmountMinor: 300n, debtReturnedMinor: 120n })),
    ).toBe(180n);
  });

  it('to`liq qaytarilgan chek — 0', () => {
    expect(
      q5ReceiptRemaining(receipt({ saleId: 's', debtAmountMinor: 300n, debtReturnedMinor: 300n })),
    ).toBe(0n);
  });

  it('qaytarish qarzdan KO`P (anomaliya) — manfiy emas, 0', () => {
    expect(
      q5ReceiptRemaining(receipt({ saleId: 's', debtAmountMinor: 300n, debtReturnedMinor: 500n })),
    ).toBe(0n);
  });
});

describe('q5CounterpartyCap — pos-customer-debt bilan AYNI formula', () => {
  it('reyestr bo`sh — cap = balans', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: 500n, registryOutstandingMinor: 0n }))).toBe(500n);
  });

  it('reyestr qismini qoplagan — cap = farq', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: 500n, registryOutstandingMinor: 200n }))).toBe(
      300n,
    );
  });

  it('reyestr balansni to`liq qoplagan — cap 0', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: 500n, registryOutstandingMinor: 500n }))).toBe(0n);
  });

  it('reyestr balansdan KATTA (nomuvofiqlik) — manfiy emas, 0', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: 100n, registryOutstandingMinor: 900n }))).toBe(0n);
  });

  it('🔴 AVANS (manfiy balans) — cap 0, ya`ni qator OCHILMAYDI (invariant 4)', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: -1_000n }))).toBe(0n);
  });

  it('🔴 balans O`LCHANMAGAN (`null`) — `null`, «0» EMAS', () => {
    expect(q5CounterpartyCap(cp({ balanceMinor: null }))).toBeNull();
  });
});

describe('q5StaircaseDays — sana zinapoyasi', () => {
  it('birinchi chelak — 0 kun', () => {
    expect(q5StaircaseDays(0, 50, 1, 30)).toBe(0);
    expect(q5StaircaseDays(49, 50, 1, 30)).toBe(0);
  });

  it('keyingi chelaklar — har 50 qatorda +1 kun', () => {
    expect(q5StaircaseDays(50, 50, 1, 30)).toBe(1);
    expect(q5StaircaseDays(149, 50, 1, 30)).toBe(2);
  });

  it('yuqori chegara oshmaydi', () => {
    expect(q5StaircaseDays(100_000, 50, 1, 30)).toBe(30);
  });

  it('`stepRows`=0 yoki `stepDays`=0 ⇒ zinapoya YO`Q (o`chirish yo`li)', () => {
    expect(q5StaircaseDays(999, 0, 1, 30)).toBe(0);
    expect(q5StaircaseDays(999, 50, 0, 30)).toBe(0);
  });
});

describe('planCounterpartyBackfill — taqsimot', () => {
  it('oddiy holat: bitta chek, cap yetarli', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 100_000n,
        receipts: [receipt({ saleId: 's1', debtAmountMinor: 100_000n })],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.totalMinor).toBe(100_000n);
    expect(plan.rows[0]?.cappedMinor).toBe(0n);
    expect(plan.allocatedMinor).toBe(100_000n);
    expect(plan.capLeftoverMinor).toBe(0n);
  });

  it('🔴 invariant: JAMI summa cap dan OSHMAYDI', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 150_000n,
        receipts: [
          receipt({ saleId: 's1', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-10') }),
          receipt({ saleId: 's2', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-05') }),
          receipt({ saleId: 's3', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-01') }),
        ],
      }),
      { now: NOW },
      0,
      RUN,
    );
    const sum = plan.rows.reduce((s, r) => s + r.totalMinor, 0n);
    expect(sum).toBe(150_000n);
    expect(sum).toBeLessThanOrEqual(plan.capMinor);
  });

  it('🔴 tartib YANGISIDAN ESKISIGA — qoldiq eng yangi cheklarga yoziladi', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 100_000n,
        receipts: [
          receipt({ saleId: 'eski', debtAmountMinor: 100_000n, postedAt: new Date('2026-07-01') }),
          receipt({ saleId: 'yangi', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-20') }),
        ],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows.map((r) => r.saleId)).toEqual(['yangi']);
    expect(plan.skipped.map((s) => [s.saleId, s.reason])).toEqual([['eski', 'cap-exhausted']]);
  });

  it('teng sanada tartib DETERMINISTIK (saleId bo`yicha)', () => {
    const same = new Date('2026-08-10T00:00:00.000Z');
    const build = (ids: string[]) =>
      planCounterpartyBackfill(
        cp({
          balanceMinor: 100_000n,
          receipts: ids.map((id) =>
            receipt({ saleId: id, debtAmountMinor: 50_000n, postedAt: same }),
          ),
        }),
        { now: NOW },
        0,
        RUN,
      ).rows.map((r) => r.saleId);
    expect(build(['b', 'a', 'c'])).toEqual(build(['c', 'b', 'a']));
    expect(build(['b', 'a', 'c'])).toEqual(['a', 'b']);
  });

  it('oxirgi qator cap bilan KESILADI va bu izohda yoziladi', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 30_000n,
        receipts: [receipt({ saleId: 's1', debtAmountMinor: 100_000n })],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows[0]?.totalMinor).toBe(30_000n);
    expect(plan.rows[0]?.cappedMinor).toBe(70_000n);
    expect(plan.rows[0]?.noteText).toContain('KESILDI');
  });

  it('allaqachon reyestrda bo`lgan chek — qator OCHILMAYDI (idempotentlik)', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 100_000n,
        receipts: [receipt({ saleId: 's1', alreadyRegistered: true })],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('already-registered');
  });

  it('to`liq qaytarilgan chek — qator OCHILMAYDI', () => {
    const plan = planCounterpartyBackfill(
      cp({
        balanceMinor: 100_000n,
        receipts: [
          receipt({ saleId: 's1', debtAmountMinor: 100_000n, debtReturnedMinor: 100_000n }),
        ],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('fully-returned');
    expect(plan.skipReason).toBe('no-eligible-receipts');
  });

  it('🔴 AVANSLI mijoz — cap 0, qator YO`Q (invariant 4)', () => {
    const plan = planCounterpartyBackfill(cp({ balanceMinor: -500_000n }), { now: NOW }, 0, RUN);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipReason).toBe('no-unregistered-debt');
  });

  it('🔴 balansi O`LCHANMAGAN mijoz — CHETLAB O`TILADI, jim emas', () => {
    const plan = planCounterpartyBackfill(cp({ balanceMinor: null }), { now: NOW }, 0, RUN);
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipReason).toBe('balance-unmeasured');
  });

  it('reyestr balansni allaqachon qoplagan — qator YO`Q (ikki karra sanash yo`q)', () => {
    const plan = planCounterpartyBackfill(
      cp({ balanceMinor: 100_000n, registryOutstandingMinor: 100_000n }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipReason).toBe('no-unregistered-debt');
  });

  it('qator shakli Q2 yozuvchisi bilan AYNI (izoh matni bitta manbadan)', () => {
    const plan = planCounterpartyBackfill(cp(), { now: NOW }, 0, RUN);
    expect(plan.rows[0]?.comment).toBe(saleDebtComment('CHK-s1'));
  });

  it('🔴 muddat chek sanasidan EMAS, `now` + termDays dan', () => {
    const plan = planCounterpartyBackfill(
      cp({
        receipts: [receipt({ saleId: 's1', postedAt: new Date('2025-01-01T00:00:00.000Z') })],
      }),
      { now: NOW },
      0,
      RUN,
    );
    expect(plan.rows[0]?.nextContactAt).toEqual(saleDebtDueAt(NOW, DEFAULT_SALE_DEBT_TERM_DAYS));
    expect(plan.rows[0]?.nextContactAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('zinapoya GLOBAL indeksdan yuradi (`startRowIndex`)', () => {
    const plan = planCounterpartyBackfill(cp(), { now: NOW, stepRows: 2, stepDays: 1 }, 4, RUN);
    expect(plan.rows[0]?.staircaseDays).toBe(2);
    expect(plan.rows[0]?.nextContactAt).toEqual(
      saleDebtDueAt(NOW, DEFAULT_SALE_DEBT_TERM_DAYS + 2),
    );
  });

  it('izohda `run=` belgisi bor — rollback manzili', () => {
    const plan = planCounterpartyBackfill(cp(), { now: NOW }, 0, RUN);
    expect(plan.rows[0]?.noteText.startsWith(q5BackfillMarker(RUN))).toBe(true);
    expect(plan.rows[0]?.noteText).toContain(Q5_BACKFILL_MARKER);
  });
});

describe('planQ5Backfill — butun yugurish', () => {
  const twoCps = [
    cp({
      counterpartyId: 'cp-a',
      balanceMinor: 100_000n,
      receipts: [receipt({ saleId: 'a1', debtAmountMinor: 100_000n })],
    }),
    cp({
      counterpartyId: 'cp-b',
      balanceMinor: 60_000n,
      receipts: [receipt({ saleId: 'b1', debtAmountMinor: 60_000n })],
    }),
  ];

  it('jamlar to`g`ri', () => {
    const plan = planQ5Backfill(twoCps, { now: NOW }, RUN);
    expect(plan.totalRows).toBe(2);
    expect(plan.totalMinor).toBe(160_000n);
    expect(plan.truncatedRows).toBe(0);
  });

  it('🔴 zinapoya kontragentlar bo`ylab DAVOM etadi', () => {
    const plan = planQ5Backfill(twoCps, { now: NOW, stepRows: 1, stepDays: 1 }, RUN);
    expect(plan.plans[0]?.rows[0]?.staircaseDays).toBe(0);
    expect(plan.plans[1]?.rows[0]?.staircaseDays).toBe(1);
  });

  it('🔴 `limitRows` GLOBAL kesadi va kesilgani SANALADI (jim yo`qolmaydi)', () => {
    const plan = planQ5Backfill(twoCps, { now: NOW, limitRows: 1 }, RUN);
    expect(plan.totalRows).toBe(1);
    expect(plan.totalMinor).toBe(100_000n);
    expect(plan.truncatedRows).toBe(1);
    expect(plan.plans[1]?.rows).toHaveLength(0);
    expect(plan.plans[1]?.allocatedMinor).toBe(0n);
  });

  it('`limitRows` kontragent ICHIDA ham kesadi va jamlarni tuzatadi', () => {
    const plan = planQ5Backfill(
      [
        cp({
          counterpartyId: 'cp-a',
          balanceMinor: 200_000n,
          receipts: [
            receipt({ saleId: 'a1', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-10') }),
            receipt({ saleId: 'a2', debtAmountMinor: 100_000n, postedAt: new Date('2026-08-05') }),
          ],
        }),
      ],
      { now: NOW, limitRows: 1 },
      RUN,
    );
    expect(plan.totalRows).toBe(1);
    expect(plan.truncatedRows).toBe(1);
    expect(plan.plans[0]?.allocatedMinor).toBe(100_000n);
    expect(plan.plans[0]?.capLeftoverMinor).toBe(100_000n);
  });

  it('o`lchanmagan balanslar SANALADI', () => {
    const plan = planQ5Backfill([cp({ balanceMinor: null })], { now: NOW }, RUN);
    expect(plan.unmeasuredCounterparties).toBe(1);
    expect(plan.totalRows).toBe(0);
  });

  it('🔴 IDEMPOTENTLIK: birinchi yugurishdan keyin qatorlar belgilansa — ikkinchisi bo`sh', () => {
    const first = planQ5Backfill(twoCps, { now: NOW }, RUN);
    const done = new Set(first.plans.flatMap((p) => p.rows.map((r) => r.saleId)));
    const second = planQ5Backfill(
      twoCps.map((c) => ({
        ...c,
        // Backfill qatori ochilgani uchun reyestr qoldig'i o'sha summaga oshdi.
        registryOutstandingMinor:
          c.registryOutstandingMinor +
          (first.plans.find((p) => p.counterpartyId === c.counterpartyId)?.allocatedMinor ?? 0n),
        receipts: c.receipts.map((r) => ({ ...r, alreadyRegistered: done.has(r.saleId) })),
      })),
      { now: NOW },
      RUN,
    );
    expect(second.totalRows).toBe(0);
    expect(second.totalMinor).toBe(0n);
  });

  it('reja DETERMINISTIK — ikki DRY-RUN bir xil ro`yxat beradi', () => {
    const a = planQ5Backfill(twoCps, { now: NOW }, RUN);
    const b = planQ5Backfill(twoCps, { now: NOW }, RUN);
    expect(a.plans.flatMap((p) => p.rows.map((r) => [r.saleId, r.totalMinor.toString()]))).toEqual(
      b.plans.flatMap((p) => p.rows.map((r) => [r.saleId, r.totalMinor.toString()])),
    );
  });
});
