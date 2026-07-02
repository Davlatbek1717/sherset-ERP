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
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001';

interface StmtRow {
  id: string;
  paymentInId: string | null;
  paymentOutId: string | null;
  skipped: boolean;
  error: string | null;
  matchedCounterpartyId: string | null;
  direction: 'in' | 'out';
  moment: Date;
  amountMinor: bigint;
  paymentPurpose: string | null;
  documentNumber: string | null;
  currency: string;
}

function makeRow(overrides: Partial<StmtRow> = {}): StmtRow {
  return {
    id: 'row-1',
    paymentInId: null,
    paymentOutId: null,
    skipped: false,
    error: null,
    matchedCounterpartyId: 'cp-1',
    direction: 'in',
    moment: new Date('2026-05-19'),
    amountMinor: 1_500_000n,
    paymentPurpose: 'Tovar uchun',
    documentNumber: 'DOC-1',
    currency: 'UZS',
    ...overrides,
  };
}

function makePrisma(rows: StmtRow[]) {
  const bankStatement = {
    findFirst: vi.fn(async () => ({ id: 'stmt-1', state: 'parsed', rows })),
    update: vi.fn(async () => ({ id: 'stmt-1' })),
  };
  const bankStatementRow = {
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: args.where.id,
    })),
  };
  return { client: { bankStatement, bankStatementRow } };
}

function build(rows: StmtRow[], createResult: { in?: unknown; out?: unknown }) {
  const prisma = makePrisma(rows);
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
