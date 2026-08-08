import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

/**
 * Faza 12 — `DUP-03`: qarz o'chirilganda `create` yozgan `+totalMinor` balans
 * deltasi QAYTARILMASDI.
 *
 * TUZATISHDAN OLDINGI holat: `create()` (2026-08-05 kassa TZ §7.3) balansga
 * `+total` yozadi, `remove()` esa faqat `deletedAt` qo'yardi — hech qanday
 * `applyDelta` yo'q. Natijada kassir adashib ochgan va darhol o'chirgan qarz
 * kontragent kartochkasida ABADIY «qarzdor» bo'lib qolardi (reyestrdan
 * yo'qolgan, balansdan yo'qolmagan).
 *
 * NON-VACUOUS: tuzatishdan oldingi `remove()` bilan 1-test balansni
 * `+500 000` da qoldiradi (0 emas), 2-test 0 ta delta beradi (1 emas),
 * 3-test ikki reversal yozadi (bittasi emas), 4-test to'lov tushib ulgurgan
 * qarzni o'chirib yuboradi.
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

interface DebtRow {
  id: string;
  accountId: string;
  counterpartyId: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  deletedAt: Date | null;
}

interface DebtWhere {
  id?: string;
  accountId?: string;
  deletedAt?: null;
  paidMinor?: bigint;
}

function makeDb(opts: { onMustFind?: (rows: DebtRow[]) => void } = {}) {
  const rows: DebtRow[] = [];
  const deltas: Array<{ deltaMinor: bigint; docType?: string; docId?: string }> = [];
  /** Kontragent bosh daftari (bitta valyuta) — testlar yakuniy saldoni shundan o'qiydi. */
  let ledgerMinor = 0n;
  let seq: { value: number } | null = null;

  const matches = (r: DebtRow, w: DebtWhere) =>
    (w.id === undefined || r.id === w.id) &&
    (w.accountId === undefined || r.accountId === w.accountId) &&
    (w.deletedAt === undefined || r.deletedAt === null) &&
    (w.paidMinor === undefined || r.paidMinor === w.paidMinor);

  const debtModel = {
    findFirst: async (args: { where: DebtWhere }) => {
      await Promise.resolve();
      const row = rows.find((r) => matches(r, args.where));
      const snapshot = row ? { ...row } : null;
      // Tranzaksiyadan TASHQARIDAGI o'qish — qaytgandan keyin raqib
      // tranzaksiya qatorni o'zgartirib ulgurishi mumkin (TOCTOU).
      opts.onMustFind?.(rows);
      return snapshot;
    },
    create: async (args: { data: Record<string, unknown> }) => {
      const row = {
        id: `debt-${rows.length + 1}`,
        deletedAt: null,
        ...(args.data as unknown as Omit<DebtRow, 'id' | 'deletedAt'>),
      };
      rows.push(row);
      return { ...row };
    },
    // Atomik claim: birinchi `await`gacha sinxron — qulflangan qator yozuvi kabi.
    updateMany: async (args: { where: DebtWhere; data: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, args.where));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === args.where.id);
      if (!row) throw new Error('debt not found');
      Object.assign(row, args.data);
      return { ...row };
    },
  };

  const tx = {
    documentSequence: {
      findUnique: async () => seq,
      createMany: async (args: { data: Array<{ value: number }> }) => {
        seq ??= { value: args.data[0].value };
      },
      update: async () => {
        const s = seq as { value: number };
        s.value += 1;
        return { value: s.value };
      },
    },
    debt: debtModel,
    debtNote: { create: async () => ({}) },
  };

  const client = {
    counterparty: { findFirst: async () => ({ id: CP }) },
    debt: debtModel,
    $transaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> => fn(tx),
  };

  const balances = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        _currency: string,
        deltaMinor: bigint,
        meta?: { docType?: string; docId?: string },
      ) => {
        ledgerMinor += deltaMinor;
        deltas.push({ deltaMinor, docType: meta?.docType, docId: meta?.docId });
      },
    ),
  };

  const svc = new DebtService(
    { client } as never,
    undefined as never,
    undefined as never,
    balances as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  return { svc, rows, deltas, balances, ledger: () => ledgerMinor };
}

const newDebt = (svc: DebtService, totalMinor: string) =>
  svc.create(ACC, USER, 'cashier', {
    counterpartyId: CP,
    totalMinor,
    currency: 'UZS',
    comment: 'Test qarz',
    nextContactAt: '2026-08-20T00:00:00.000Z',
  });

describe('DebtService.remove — DUP-03 balans simmetriyasi', () => {
  it('create → remove: kontragent saldosi AYNAN nolga qaytadi', async () => {
    const { svc, ledger, deltas } = makeDb();

    const debt = await newDebt(svc, '500000');
    expect(ledger()).toBe(500_000n); // create tomoni (2026-08-05)

    await svc.remove(ACC, debt.id);

    expect(ledger()).toBe(0n);
    expect(deltas.map((d) => d.deltaMinor)).toEqual([500_000n, -500_000n]);
  });

  it("reversal qarz kartochkasiga havola bilan yoziladi (jurnal izlanadigan bo'lsin)", async () => {
    const { svc, deltas } = makeDb();

    const debt = await newDebt(svc, '120000');
    await svc.remove(ACC, debt.id);

    expect(deltas[1]).toMatchObject({
      deltaMinor: -120_000n,
      docType: 'debt',
      docId: debt.id,
    });
  });

  it("ikki parallel o'chirish: reversal FAQAT bir marta yoziladi", async () => {
    const { svc, ledger, deltas } = makeDb();

    const debt = await newDebt(svc, '80000');
    const results = await Promise.allSettled([svc.remove(ACC, debt.id), svc.remove(ACC, debt.id)]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(NotFoundException);
    expect(deltas.filter((d) => d.deltaMinor < 0n)).toHaveLength(1);
    expect(ledger()).toBe(0n);
  });

  it("to'lov kiritilgan qarz o'chirilmaydi — balansga ham tegilmaydi", async () => {
    const { svc, rows, ledger, deltas } = makeDb();

    const debt = await newDebt(svc, '90000');
    (rows[0] as DebtRow).paidMinor = 10_000n;

    await expect(svc.remove(ACC, debt.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deltas.filter((d) => d.deltaMinor < 0n)).toHaveLength(0);
    expect(ledger()).toBe(90_000n);
  });

  it("o'qish bilan yozuv orasida tushgan to'lov o'chirishni to'xtatadi (TOCTOU)", async () => {
    // `mustFind` toza qarzni ko'radi, keyin raqib kassir to'lov qabul qiladi.
    // Reversal `-total` bo'lgani uchun bu holda saldo `-paid` ga tushib ketardi.
    const { svc, rows, ledger, deltas } = makeDb({
      onMustFind: (r) => {
        const live = r.find((x) => x.deletedAt === null);
        if (live && live.paidMinor === 0n) live.paidMinor = 25_000n;
      },
    });

    const debt = await newDebt(svc, '70000');

    await expect(svc.remove(ACC, debt.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((rows[0] as DebtRow).deletedAt).toBeNull();
    expect(deltas.filter((d) => d.deltaMinor < 0n)).toHaveLength(0);
    expect(ledger()).toBe(70_000n);
  });
});
