import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { mockDocumentSequence } from '../../prisma/document-sequence.mock.js';
import { UpdatePayrollSchema } from './payroll.schema.js';
import { PayrollService } from './payroll.service.js';

/**
 * Payroll service coverage:
 *   - sum derived from lines (signed: earnings + deductions)
 *   - period validation (start ≤ end)
 *   - update + delete locked on posted
 *   - FSM transitions (post / unpost / cancel)
 *   - replace-all line semantics with recomputed sum
 *   - empty line list rejected
 */

interface PayrollLine {
  id?: string;
  payrollId?: string;
  position: number;
  itemType: string;
  itemName: string;
  sumMinor: bigint;
  meta?: Record<string, unknown> | null;
}

interface PayrollRow {
  id: string;
  accountId: string;
  name: string;
  organizationId: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  moment: Date;
  state: string;
  applicable: boolean;
  postedAt: Date | null;
  sumMinor: bigint;
  currency: string;
  rateValue: bigint;
  description: string | null;
  externalCode: string | null;
  deletedAt: Date | null;
  lines: PayrollLine[];
  organization: { id: string; name: string };
  employee: {
    id: string;
    name: string;
    fullName: string | null;
    position: string | null;
    inn: string | null;
  };
}

function makeRow(overrides: Partial<PayrollRow> = {}): PayrollRow {
  return {
    id: 'pr-1',
    accountId: 'acc-1',
    name: 'Z-2026-00001',
    organizationId: '00000000-0000-0000-0000-000000000010',
    employeeId: '00000000-0000-0000-0000-000000000050',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
    moment: new Date('2026-05-12'),
    state: 'draft',
    applicable: false,
    postedAt: null,
    sumMinor: 0n,
    currency: 'UZS',
    rateValue: 100_000_000n,
    description: null,
    externalCode: null,
    deletedAt: null,
    lines: [],
    organization: { id: '00000000-0000-0000-0000-000000000010', name: 'MCHJ Demo' },
    employee: {
      id: '00000000-0000-0000-0000-000000000050',
      name: 'Admin User',
      fullName: 'Admin User',
      position: 'Administrator',
      inn: null,
    },
    ...overrides,
  };
}

function makePrismaMock(rows: PayrollRow[]) {
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      rows.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const create = vi.fn(async (args: { data: Partial<PayrollRow> }) => {
    const row = makeRow(args.data);
    rows.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<PayrollRow> }) => {
    const row = rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const count = vi.fn(async () => rows.length);
  const findMany = vi.fn(async () => rows);

  const payroll = { findFirst, findUnique: findFirst, create, update, count, findMany };

  const lineDeleteMany = vi.fn(async () => ({ count: 0 }));
  const lineCreateMany = vi.fn(async (args: { data: PayrollLine[] }) => {
    // Persist into the parent row so subsequent findById sees them
    const payrollId = (args.data[0] as PayrollLine | undefined)?.payrollId;
    if (payrollId) {
      const row = rows.find((r) => r.id === payrollId);
      if (row) row.lines = args.data.map((l) => ({ ...l }));
    }
    return { count: args.data.length };
  });
  const payrollLine = { deleteMany: lineDeleteMany, createMany: lineCreateMany };

  const organization = { findFirst: vi.fn(async () => ({ id: 'org', name: 'Demo' })) };
  const employee = {
    findFirst: vi.fn(async () => ({ id: 'emp', name: 'Demo' })),
    findUnique: vi.fn(async () => null),
  };
  const auditLog = { create: vi.fn(async () => ({ id: 'audit-1' })) };

  const $transaction = vi.fn(
    async (
      fn: (tx: {
        payroll: typeof payroll;
        payrollLine: typeof payrollLine;
        auditLog: typeof auditLog;
      }) => Promise<unknown>,
    ) => fn({ payroll, payrollLine, auditLog }),
  );

  return {
    client: {
      payroll,
      payrollLine,
      organization,
      employee,
      auditLog,
      $transaction,
      documentSequence: mockDocumentSequence(),
    },
    spies: { findFirst, create, update, lineCreateMany, lineDeleteMany },
  };
}

const validInput = {
  organizationId: '00000000-0000-0000-0000-000000000010',
  employeeId: '00000000-0000-0000-0000-000000000050',
  periodStart: '2026-05-01',
  periodEnd: '2026-05-31',
  lines: [
    { itemType: 'salary', itemName: 'Asosiy oylik', sumMinor: '500000000' },
    { itemType: 'bonus', itemName: 'Mukofot', sumMinor: '50000000' },
    { itemType: 'tax_income', itemName: 'NDFL 12%', sumMinor: '-66000000' },
  ],
};

describe('PayrollService — create', () => {
  it('computes header sumMinor as signed sum of lines', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', validInput);
    // 500M + 50M − 66M = 484M
    expect(rows[0]?.sumMinor).toBe(484_000_000n);
  });

  it('rejects when lines array is empty', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.create('acc-1', 'emp-1', { ...validInput, lines: [] })).rejects.toThrow();
  });

  it('rejects when periodStart > periodEnd', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(
      svc.create('acc-1', 'emp-1', {
        ...validInput,
        periodStart: '2026-06-01',
        periodEnd: '2026-05-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles all-negative payroll (e.g. retroactive deduction only)', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', {
      ...validInput,
      lines: [{ itemType: 'penalty', itemName: 'Jarima', sumMinor: '-10000000' }],
    });
    expect(rows[0]?.sumMinor).toBe(-10_000_000n);
  });

  it('post-on-create sets state=posted and stamps postedAt', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', { ...validInput, applicable: true });
    expect(rows[0]?.state).toBe('posted');
    expect(rows[0]?.applicable).toBe(true);
    expect(rows[0]?.postedAt).toBeInstanceOf(Date);
  });

  it('persists lines via createMany', async () => {
    const rows: PayrollRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', validInput);
    expect(prisma.spies.lineCreateMany).toHaveBeenCalledTimes(1);
    const linesArg = prisma.spies.lineCreateMany.mock.calls[0]?.[0] as {
      data: PayrollLine[];
    };
    expect(linesArg.data).toHaveLength(3);
    expect(linesArg.data[0]?.position).toBe(1);
    expect(linesArg.data[2]?.sumMinor).toBe(-66_000_000n);
  });
});

describe('PayrollService — update', () => {
  it('rejects edits on posted', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(
      svc.update('acc-1', 'emp-1', 'pr-1', { version: 1, description: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('replace-all line semantics + recomputes header sum', async () => {
    const rows = [
      makeRow({
        lines: [{ position: 1, itemType: 'salary', itemName: 'Oylik', sumMinor: 500_000_000n }],
        sumMinor: 500_000_000n,
      }),
    ];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.update('acc-1', 'emp-1', 'pr-1', {
      version: 1,
      lines: [
        { itemType: 'salary', itemName: 'Yangi oylik', sumMinor: '700000000' },
        { itemType: 'tax_income', itemName: 'NDFL', sumMinor: '-84000000' },
      ],
    });
    expect(prisma.spies.lineDeleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.spies.lineCreateMany).toHaveBeenCalledTimes(1);
    expect(rows[0]?.sumMinor).toBe(616_000_000n);
  });

  it('rejects update with empty lines array', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.update('acc-1', 'emp-1', 'pr-1', { version: 1, lines: [] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects period change when start > end (uses existing fields when only one updated)', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(
      svc.update('acc-1', 'emp-1', 'pr-1', { version: 1, periodStart: '2026-12-31' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('UpdatePayrollSchema — optimistic-lock contract', () => {
  it('REQUIRES version — a payroll edit (line rewrite) cannot silently bypass the lost-update guard', () => {
    expect(UpdatePayrollSchema.safeParse({ description: 'x' }).success).toBe(false);
    expect(UpdatePayrollSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a version-only payload (every field except version is optional)', () => {
    expect(UpdatePayrollSchema.safeParse({ version: 1 }).success).toBe(true);
  });
});

describe('PayrollService — transition (post / unpost / cancel)', () => {
  it('post: draft → posted with valid lines', async () => {
    const rows = [
      makeRow({
        lines: [{ position: 1, itemType: 'salary', itemName: 'Oylik', sumMinor: 500_000_000n }],
      }),
    ];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.transition('acc-1', 'emp-1', 'pr-1', 'post');
    expect(rows[0]?.state).toBe('posted');
    expect(rows[0]?.applicable).toBe(true);
  });

  it('post: rejects when no lines exist', async () => {
    const rows = [makeRow({ lines: [] })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.transition('acc-1', 'emp-1', 'pr-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('post: rejects when already posted', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.transition('acc-1', 'emp-1', 'pr-1', 'post')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('unpost: posted → draft, clears postedAt', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true, postedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.transition('acc-1', 'emp-1', 'pr-1', 'unpost');
    expect(rows[0]?.state).toBe('draft');
    expect(rows[0]?.applicable).toBe(false);
    expect(rows[0]?.postedAt).toBeNull();
  });

  it('cancel: any non-cancelled state → cancelled', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.transition('acc-1', 'emp-1', 'pr-1', 'cancel');
    expect(rows[0]?.state).toBe('cancelled');
    expect(rows[0]?.applicable).toBe(false);
  });

  it('cancel: rejects when already cancelled', async () => {
    const rows = [makeRow({ state: 'cancelled' })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.transition('acc-1', 'emp-1', 'pr-1', 'cancel')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid transition target', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.transition('acc-1', 'emp-1', 'pr-1', 'invalid')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('PayrollService — soft delete + find', () => {
  it('softDelete rejects posted', async () => {
    const rows = [makeRow({ state: 'posted', applicable: true })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.softDelete('acc-1', 'emp-1', 'pr-1')).rejects.toThrow(BadRequestException);
  });

  it('softDelete succeeds on draft + stamps deletedAt + state=cancelled', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await svc.softDelete('acc-1', 'emp-1', 'pr-1');
    expect(rows[0]?.deletedAt).toBeInstanceOf(Date);
    expect(rows[0]?.state).toBe('cancelled');
  });

  it('findById excludes soft-deleted', async () => {
    const rows = [makeRow({ deletedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PayrollService({ client: prisma.client } as never);
    await expect(svc.findById('acc-1', 'pr-1')).rejects.toThrow(NotFoundException);
  });
});
