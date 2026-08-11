import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

/**
 * P1 (2026-08-11) — ADOPSIYA QATORINING BALANS SIMMETRIYASI.
 *
 * `remove()` har qarzga `−totalMinor` yozadi, chunki `create()` `+totalMinor`
 * yozgan edi (`DUP-03`, `debt-remove-reversal.test.ts`). Adopsiya qatori esa
 * (`balanceAdopted: true`) balansga HECH NIMA yozmagan — qarz u yerda
 * allaqachon bor edi.
 *
 * ⚠️ Shuning uchun uni o'chirish `−total` yozmasligi SHART: aks holda bir
 * bosish mijozning haqiqiy qarzini balansdan o'chirib yuborardi (masalan
 * storno qilingan 1 000 so'mlik adopsiya qatorini o'chirish 1 000 so'mni
 * balansdan ham «to'langan» qilib qo'yardi).
 *
 * NON-VACUOUS: qo'riqchisiz `remove()` bu testda `−500 000` delta yozadi va
 * saldo `0` ga tushadi (kutilgani — `500 000` o'zgarishsiz qolishi).
 */

const ACC = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

interface DebtRow {
  id: string;
  accountId: string;
  counterpartyId: string;
  name: string;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  balanceAdopted: boolean;
  deletedAt: Date | null;
}

interface DebtWhere {
  id?: string;
  accountId?: string;
  deletedAt?: null;
  paidMinor?: bigint;
}

function makeDb(seed: DebtRow[]) {
  const rows = seed;
  const deltas: Array<{ deltaMinor: bigint; docType?: string }> = [];
  /** Kontragent bosh daftari — mijozning balansdagi qarzi. */
  let ledgerMinor = 500_000n;

  const matches = (r: DebtRow, w: DebtWhere) =>
    (w.id === undefined || r.id === w.id) &&
    (w.accountId === undefined || r.accountId === w.accountId) &&
    (w.deletedAt === undefined || r.deletedAt === null) &&
    (w.paidMinor === undefined || r.paidMinor === w.paidMinor);

  const debtModel = {
    findFirst: async (args: { where: DebtWhere }) => {
      await Promise.resolve();
      const row = rows.find((r) => matches(r, args.where));
      return row ? { ...row } : null;
    },
    updateMany: async (args: { where: DebtWhere; data: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, args.where));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
  };

  const client = {
    debt: debtModel,
    $transaction: async <T>(fn: (t: unknown) => Promise<T>): Promise<T> =>
      fn({ debt: debtModel, debtNote: { create: async () => ({}) } }),
  };

  const balances = {
    applyDelta: vi.fn(
      async (
        _tx: unknown,
        _accountId: string,
        _counterpartyId: string,
        _currency: string,
        deltaMinor: bigint,
        meta?: { docType?: string },
      ) => {
        ledgerMinor += deltaMinor;
        deltas.push({ deltaMinor, docType: meta?.docType });
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

  return { svc, rows, deltas, ledger: () => ledgerMinor };
}

const row = (over: Partial<DebtRow> = {}): DebtRow => ({
  id: 'debt-1',
  accountId: ACC,
  counterpartyId: CP,
  name: 'QRZ-2026-00101',
  totalMinor: 500_000n,
  paidMinor: 0n,
  currency: 'UZS',
  status: 'unpaid',
  balanceAdopted: false,
  deletedAt: null,
  ...over,
});

describe('DebtService.remove — adopsiya qatori (P1)', () => {
  it("adopsiya qatorini o'chirish balansga TEGMAYDI", async () => {
    const db = makeDb([row({ balanceAdopted: true })]);

    await db.svc.remove(ACC, 'debt-1');

    expect(db.deltas).toHaveLength(0);
    expect(db.ledger()).toBe(500_000n);
    // O'chirishning o'zi baribir bajariladi (reyestrdan chiqadi).
    expect(db.rows[0]?.deletedAt).not.toBeNull();
  });

  it("ODATDAGI qarzda `−total` reversal SAQLANADI (DUP-03 regressiyasi yo'q)", async () => {
    const db = makeDb([row({ balanceAdopted: false })]);

    await db.svc.remove(ACC, 'debt-1');

    expect(db.deltas).toEqual([{ deltaMinor: -500_000n, docType: 'debt' }]);
    expect(db.ledger()).toBe(0n);
  });
});
