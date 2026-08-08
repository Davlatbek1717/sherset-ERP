import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentInService } from '../payment-in/payment-in.service.js';
import type { PaymentOutService } from '../payment-out/payment-out.service.js';
import { BankImportService } from './bank-import.service.js';

/**
 * commit() creates a PaymentIn/Out per row. PaymentInService.create /
 * PaymentOutService.create are typed `Promise<T | undefined>` (the catch
 * branch can fall through). These tests pin the contract: a missing
 * record is a per-row failure with a clear message — never a crash on
 * `.id` of undefined.
 *
 * Faza 20 (INT-05) qo'shimchasi: commit poygasi (ikki parallel commit bir
 * qatorga IKKI PaymentIn yaratardi) va vypiska-dedup (bir faylni ikki marta
 * yuklab commit qilish butun oyni dublikat qilardi). Quyidagi ikki describe
 * o'sha ikki stsenariyni qulflaydi.
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001';

interface StmtRow {
  id: string;
  paymentInId: string | null;
  paymentOutId: string | null;
  commitClaimedAt: Date | null;
  skipped: boolean;
  error: string | null;
  matchedCounterpartyId: string | null;
  direction: 'in' | 'out';
  moment: Date;
  amountMinor: bigint;
  paymentPurpose: string | null;
  documentNumber: string | null;
  counterpartyAccount: string | null;
  currency: string;
}

function makeRow(overrides: Partial<StmtRow> = {}): StmtRow {
  return {
    id: 'row-1',
    paymentInId: null,
    paymentOutId: null,
    commitClaimedAt: null,
    skipped: false,
    error: null,
    matchedCounterpartyId: 'cp-1',
    direction: 'in',
    moment: new Date('2026-05-19'),
    amountMinor: 1_500_000n,
    paymentPurpose: 'Tovar uchun',
    documentNumber: 'DOC-1',
    counterpartyAccount: '20208000000000000001',
    currency: 'UZS',
    ...overrides,
  };
}

/**
 * Prisma o'rniga — lekin `updateMany` semantikasi HAQIQIY: shartlar joriy
 * qator holatiga solishtiriladi va faqat mos kelsa yoziladi. Aynan shu
 * atomiklik commit-poygasini tutadi; oddiy `vi.fn(async()=>({count:1}))`
 * mock'i bug'ni ko'rsata olmasdi.
 */
function makePrisma(rows: StmtRow[], duplicateRow: Record<string, unknown> | null = null) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));

  const matches = (r: StmtRow, where: Record<string, unknown>): boolean => {
    if (where.paymentInId === null && r.paymentInId !== null) return false;
    if (where.paymentOutId === null && r.paymentOutId !== null) return false;
    if (where.commitClaimedAt instanceof Date) {
      if (r.commitClaimedAt?.getTime() !== where.commitClaimedAt.getTime()) return false;
    }
    const or = where.OR as Array<{ commitClaimedAt: null | { lt: Date } }> | undefined;
    if (or) {
      const ok = or.some((c) =>
        c.commitClaimedAt === null
          ? r.commitClaimedAt === null
          : r.commitClaimedAt !== null && r.commitClaimedAt < c.commitClaimedAt.lt,
      );
      if (!ok) return false;
    }
    return true;
  };

  const bankStatement = {
    findFirst: vi.fn(async () => ({
      id: 'stmt-1',
      state: 'parsed',
      rows: Array.from(state.values()).map((r) => ({ ...r })),
    })),
    update: vi.fn(async () => ({ id: 'stmt-1' })),
  };
  const bankStatementRow = {
    findFirst: vi.fn(async () => duplicateRow),
    updateMany: vi.fn(
      async (args: { where: { id: string } & Record<string, unknown>; data: Partial<StmtRow> }) => {
        const r = state.get(args.where.id);
        if (!r || !matches(r, args.where)) return { count: 0 };
        Object.assign(r, args.data);
        return { count: 1 };
      },
    ),
    update: vi.fn(async (args: { where: { id: string }; data: Partial<StmtRow> }) => {
      const r = state.get(args.where.id);
      if (r) Object.assign(r, args.data);
      return { id: args.where.id };
    }),
  };
  return { client: { bankStatement, bankStatementRow }, state };
}

function build(
  rows: StmtRow[],
  createResult: { in?: unknown; out?: unknown },
  duplicateRow: Record<string, unknown> | null = null,
) {
  const prisma = makePrisma(rows, duplicateRow);
  const paymentIn = { create: vi.fn(async () => createResult.in) };
  const paymentOut = { create: vi.fn(async () => createResult.out) };
  const svc = new BankImportService(
    { client: prisma.client } as never,
    paymentIn as unknown as PaymentInService,
    paymentOut as unknown as PaymentOutService,
  );
  return { svc, prisma, paymentIn, paymentOut };
}

describe('BankImportService.commit — payment create result guard', () => {
  it('records a failure (not a crash) when paymentIn.create returns no record', async () => {
    const { svc } = build([makeRow({ direction: 'in' })], { in: undefined });

    const res = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });

    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([{ rowId: 'row-1', error: 'payment create returned no record' }]);
  });

  it('records a failure (not a crash) when paymentOut.create returns no record', async () => {
    const { svc } = build([makeRow({ direction: 'out' })], { out: undefined });

    const res = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });

    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([{ rowId: 'row-1', error: 'payment create returned no record' }]);
  });

  it('still imports the row when paymentIn.create returns a record', async () => {
    const { svc, prisma } = build([makeRow({ direction: 'in' })], { in: { id: 'pi-1' } });

    const res = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });

    expect(res.failed).toEqual([]);
    expect(res.succeeded).toEqual(['row-1']);
    expect(prisma.client.bankStatementRow.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { paymentInId: 'pi-1' },
    });
  });
});

describe('BankImportService.commit — INT-05 row claim race', () => {
  it('creates exactly ONE PaymentIn when two commits run in parallel on the same row', async () => {
    const { svc, paymentIn } = build([makeRow({ direction: 'in' })], { in: { id: 'pi-1' } });

    const [a, b] = await Promise.all([
      svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID }),
      svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID }),
    ]);

    expect(paymentIn.create).toHaveBeenCalledTimes(1);
    expect([...a.succeeded, ...b.succeeded]).toEqual(['row-1']);
  });

  it('creates exactly ONE PaymentOut when two commits run in parallel on the same row', async () => {
    const { svc, paymentOut } = build([makeRow({ direction: 'out' })], { out: { id: 'po-1' } });

    const [a, b] = await Promise.all([
      svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID }),
      svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID }),
    ]);

    expect(paymentOut.create).toHaveBeenCalledTimes(1);
    expect([...a.succeeded, ...b.succeeded]).toEqual(['row-1']);
  });

  it('releases the claim when the payment create fails, so a retry can import the row', async () => {
    const prisma = makePrisma([makeRow({ direction: 'in' })]);
    const paymentIn = {
      create: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'pi-1' }),
    };
    const svc = new BankImportService(
      { client: prisma.client } as never,
      paymentIn as unknown as PaymentInService,
      { create: vi.fn() } as unknown as PaymentOutService,
    );

    const first = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });
    expect(first.succeeded).toEqual([]);
    expect(first.failed).toEqual([{ rowId: 'row-1', error: 'boom' }]);
    // Claim olindi VA bo'shatildi — aks holda qator abadiy qulflanib qolardi.
    expect(prisma.client.bankStatementRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { commitClaimedAt: null } }),
    );
    expect(prisma.state.get('row-1')?.commitClaimedAt).toBeNull();

    const second = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });
    expect(second.succeeded).toEqual(['row-1']);
  });
});

describe('BankImportService.commit — INT-05 statement-row dedup', () => {
  const alreadyImported = {
    id: 'row-old',
    statementId: 'stmt-old',
    paymentInId: 'pi-old',
    paymentOutId: null,
  };

  it('refuses a row whose transaction was already imported by another statement', async () => {
    const { svc, paymentIn } = build(
      [makeRow({ direction: 'in' })],
      { in: { id: 'pi-1' } },
      alreadyImported,
    );

    const res = await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });

    expect(paymentIn.create).not.toHaveBeenCalled();
    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([
      {
        rowId: 'row-1',
        error: 'Duplicate of already-imported row row-old (statement stmt-old)',
      },
    ]);
  });

  it('matches the duplicate on the bank-transaction natural key, not on the row id', async () => {
    const { svc, prisma } = build(
      [makeRow({ direction: 'in' })],
      { in: { id: 'pi-1' } },
      alreadyImported,
    );

    await svc.commit('acc-1', 'user-1', 'stmt-1', { organizationId: ORG_ID });

    expect(prisma.client.bankStatementRow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'acc-1',
          id: { not: 'row-1' },
          direction: 'in',
          moment: new Date('2026-05-19'),
          amountMinor: 1_500_000n,
          documentNumber: 'DOC-1',
          counterpartyAccount: '20208000000000000001',
          OR: [{ paymentInId: { not: null } }, { paymentOutId: { not: null } }],
        }),
      }),
    );
  });

  it('imports anyway when the user explicitly allows the duplicate for that row', async () => {
    // `allowDuplicateRowIds` uuid-validatsiyadan o'tadi (real qator id'lari
    // uuid) — shu testda qator id'si ham haqiqiy uuid bo'lishi kerak.
    const ROW_UUID = '00000000-0000-0000-0000-0000000000aa';
    const { svc, paymentIn } = build(
      [makeRow({ id: ROW_UUID, direction: 'in' })],
      { in: { id: 'pi-1' } },
      alreadyImported,
    );

    const res = await svc.commit('acc-1', 'user-1', 'stmt-1', {
      organizationId: ORG_ID,
      allowDuplicateRowIds: [ROW_UUID],
    });

    expect(paymentIn.create).toHaveBeenCalledTimes(1);
    expect(res.succeeded).toEqual([ROW_UUID]);
  });
});

describe('BankImportService.upload — INT-05 file dedup', () => {
  const CSV = [
    'date,amount,direction,counterparty_inn,counterparty_name,payment_purpose',
    '2026-04-24,1234567.89,in,123456789,"Alpha LLC",Oplata',
  ].join('\n');

  function buildUpload(prior: Record<string, unknown> | null) {
    const bankStatement = {
      findFirst: vi.fn(async () => prior),
      create: vi.fn(async () => ({ id: 'stmt-new', rows: [] })),
    };
    const counterparty = { findMany: vi.fn(async () => []) };
    const svc = new BankImportService(
      { client: { bankStatement, counterparty } } as never,
      { create: vi.fn() } as unknown as PaymentInService,
      { create: vi.fn() } as unknown as PaymentOutService,
    );
    return { svc, bankStatement };
  }

  it('stores the content hash so a re-upload of the same file is recognisable', async () => {
    const { svc, bankStatement } = buildUpload(null);

    const res = await svc.upload('acc-1', 'user-1', { filename: 'may.csv', content: CSV });

    const expected = createHash('sha256').update(CSV, 'utf8').digest('hex');
    expect(bankStatement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentHash: expected }),
      }),
    );
    expect(res.duplicateOf).toBeNull();
  });

  it('reports the earlier statement when the same file is uploaded twice', async () => {
    const prior = {
      id: 'stmt-old',
      filename: 'may.csv',
      createdAt: new Date('2026-05-01'),
      rowCountImported: 42,
      state: 'committed',
    };
    const { svc } = buildUpload(prior);

    const res = await svc.upload('acc-1', 'user-1', { filename: 'may-copy.csv', content: CSV });

    expect(res.duplicateOf).toEqual({
      id: 'stmt-old',
      filename: 'may.csv',
      createdAt: prior.createdAt,
      rowCountImported: 42,
      state: 'committed',
    });
  });
});
