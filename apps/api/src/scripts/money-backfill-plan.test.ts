import { describe, expect, it } from 'vitest';
import {
  type MoneyBackfillDoc,
  backfillDescription,
  journalKey,
  planMoneyBackfill,
  rollbackSql,
  sourceKey,
} from './money-backfill-plan.js';

/**
 * P14/`H4` — pul daftari backfill rejasining sof qoidalari.
 *
 * Bu testlar skriptni emas, QARORNI o'lchaydi: nima yoziladi, nima ATAYLAB
 * yozilmaydi va ikkinchi yugurtirish nima qiladi. Har biri bitta xotira-sabog'ini
 * qulflaydi (`cell-migration-delta-not-total` · `opening-row-is-not-a-movement`).
 */

const AT = new Date('2026-07-01T10:00:00.000Z');

const doc = (over: Partial<MoneyBackfillDoc> = {}): MoneyBackfillDoc => ({
  documentKind: 'payment_in',
  documentId: 'doc-1',
  accountId: 'acc-1',
  name: 'ПП-2026-00001',
  sourceKind: 'organization_account',
  sourceId: 'oa-1',
  sourceCurrency: 'UZS',
  currency: 'UZS',
  deltaMinor: 500_000n,
  counterpartyId: 'cp-1',
  at: AT,
  ...over,
});

describe('planMoneyBackfill — FARQ, jami emas', () => {
  it("daftarda YO'Q hujjat uchun qator rejalashtiradi", () => {
    const plan = planMoneyBackfill([doc()], new Set());

    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].deltaMinor).toBe(500_000n);
    expect(plan.skipped).toEqual([]);
  });

  it("🔴 daftarda BOR hujjat qayta yozilmaydi (ikkinchi yugurtirish bo'sh)", () => {
    const d = doc();
    const existing = new Set([journalKey(d.documentKind, d.documentId)]);

    const plan = planMoneyBackfill([d], existing);

    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ documentId: 'doc-1', reason: 'already_journaled' }),
    ]);
  });

  it("🔴 idempotentlik: birinchi rejadagi qatorlar daftarga tushgach ikkinchi reja BO'SH", () => {
    const docs = [doc({ documentId: 'd1' }), doc({ documentId: 'd2', deltaMinor: -200_000n })];

    const first = planMoneyBackfill(docs, new Set());
    expect(first.rows).toHaveLength(2);

    // «Yozildi» ni simulyatsiya qilamiz — reja qatorlaridan kalit to'plami.
    const afterWrite = new Set(first.rows.map((r) => journalKey(r.documentKind, r.documentId)));
    const second = planMoneyBackfill(docs, afterWrite);

    expect(second.rows).toEqual([]);
    expect(second.expectedShiftBySource.size).toBe(0);
  });

  it('qisman yozilgan holatda FAQAT qolgani rejalashtiriladi (jami qayta yozilmaydi)', () => {
    const docs = [doc({ documentId: 'd1' }), doc({ documentId: 'd2' }), doc({ documentId: 'd3' })];
    const existing = new Set([journalKey('payment_in', 'd2')]);

    const plan = planMoneyBackfill(docs, existing);

    expect(plan.rows.map((r) => r.documentId)).toEqual(['d1', 'd3']);
    expect(plan.expectedShiftBySource.get(sourceKey('organization_account', 'oa-1'))).toBe(
      1_000_000n,
    );
  });
});

describe('planMoneyBackfill — yozilmaydigan holatlar', () => {
  it("🔴 valyuta manbaga mos kelmasa REJAGA KIRMAYDI (jim konvertatsiya yo'q)", () => {
    const plan = planMoneyBackfill([doc({ currency: 'USD', sourceCurrency: 'UZS' })], new Set());

    expect(plan.rows).toEqual([]);
    expect(plan.skipped[0].reason).toBe('currency_mismatch');
    expect(plan.skipped[0].detail).toContain('USD');
    expect(plan.skipped[0].detail).toContain('UZS');
  });

  it("manba topilmasa ham valyuta-mos-emas deb chetga qo'yiladi (taxmin qilinmaydi)", () => {
    const plan = planMoneyBackfill([doc({ sourceCurrency: null })], new Set());

    expect(plan.rows).toEqual([]);
    expect(plan.skipped[0].reason).toBe('currency_mismatch');
  });

  it("🔴 manbasiz hujjat BUG emas — jonli kod ham yozmaydi, backfill o'ylab topmaydi", () => {
    const plan = planMoneyBackfill([doc({ sourceId: null })], new Set());

    expect(plan.rows).toEqual([]);
    expect(plan.skipped[0].reason).toBe('no_source');
  });

  it('nol delta daftarga tushmaydi', () => {
    const plan = planMoneyBackfill([doc({ deltaMinor: 0n })], new Set());

    expect(plan.rows).toEqual([]);
    expect(plan.skipped[0].reason).toBe('zero_delta');
  });

  it('allaqachon yozilgan hujjat boshqa sabablardan OLDIN chetga chiqadi (tartib muhim)', () => {
    // Valyutasi ham mos emas, lekin daftarda bor — «already_journaled» g'olib.
    const d = doc({ currency: 'USD', sourceCurrency: 'UZS' });
    const plan = planMoneyBackfill([d], new Set([journalKey(d.documentKind, d.documentId)]));

    expect(plan.skipped[0].reason).toBe('already_journaled');
  });
});

describe('planMoneyBackfill — qator mazmuni', () => {
  it("🔴 `at` hujjatning O'Z oni bo'ladi, backfill kuni EMAS", () => {
    const plan = planMoneyBackfill([doc()], new Set());

    expect(plan.rows[0].at).toEqual(AT);
    expect(plan.rows[0].at.getTime()).toBeLessThan(Date.now());
  });

  it('ishora saqlanadi — chiqim manfiy qoladi', () => {
    const plan = planMoneyBackfill([doc({ deltaMinor: -750_000n })], new Set());

    expect(plan.rows[0].deltaMinor).toBe(-750_000n);
  });

  it("kutilayotgan qoldiq siljishi manba kesimida yig'iladi (FAQAT o'lchov)", () => {
    const plan = planMoneyBackfill(
      [
        doc({ documentId: 'd1', sourceId: 'oa-1', deltaMinor: 500_000n }),
        doc({ documentId: 'd2', sourceId: 'oa-1', deltaMinor: -200_000n }),
        doc({
          documentId: 'd3',
          documentKind: 'cash_in',
          sourceKind: 'cash_desk',
          sourceId: 'cd-1',
          deltaMinor: 100_000n,
        }),
      ],
      new Set(),
    );

    expect(plan.expectedShiftBySource.get(sourceKey('organization_account', 'oa-1'))).toBe(
      300_000n,
    );
    expect(plan.expectedShiftBySource.get(sourceKey('cash_desk', 'cd-1'))).toBe(100_000n);
  });

  it("tur bo'yicha sanoq hisobot uchun to'g'ri chiqadi", () => {
    const plan = planMoneyBackfill(
      [
        doc({ documentId: 'd1', documentKind: 'payment_in' }),
        doc({ documentId: 'd2', documentKind: 'payment_out', deltaMinor: -1n }),
        doc({ documentId: 'd3', documentKind: 'payment_out', deltaMinor: -2n }),
      ],
      new Set(),
    );

    expect(plan.countByKind.get('payment_in')).toBe(1);
    expect(plan.countByKind.get('payment_out')).toBe(2);
    expect(plan.countByKind.get('cash_in')).toBeUndefined();
  });
});

describe('rollback muhri', () => {
  it("har yugurtirish O'Z muhrini yozadi va rollback AYNAN shuni o'chiradi", () => {
    const d1 = backfillDescription('run-A', 'ПП-1');
    const d2 = backfillDescription('run-B', 'ПП-1');

    expect(d1).not.toBe(d2);
    expect(rollbackSql('run-A')).toContain("LIKE 'Backfill P14/H4 run-A:%'");
    // 🔴 B yugurtirishining rollbacki A ning qatorlariga TEGMAYDI.
    expect(rollbackSql('run-B')).not.toContain('run-A');
  });

  it("rollback FAQAT money_operations dan o'chiradi (qoldiq ustunlariga tegmaydi)", () => {
    const sql = rollbackSql('run-A');

    expect(sql).toContain('DELETE FROM money_operations');
    expect(sql).not.toContain('cash_desks');
    expect(sql).not.toContain('organization_accounts');
    expect(sql).not.toContain('UPDATE');
  });
});
