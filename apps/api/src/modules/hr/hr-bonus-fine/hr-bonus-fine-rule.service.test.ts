import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrBonusFineRuleService } from './hr-bonus-fine-rule.service.js';

function makePrisma() {
  return {
    client: {
      hrBonusFineRule: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      hrBonusFineLog: { create: vi.fn() },
      employee: { findFirst: vi.fn() },
    },
  };
}

describe('HrBonusFineRuleService.create', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineRuleService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineRuleService(prisma as any);
  });

  it('creates a rule with BigInt amount + default condition', async () => {
    prisma.client.hrBonusFineRule.create.mockResolvedValue({ id: 'r-1' });
    await svc.create('acc1', {
      name: 'Kechikish jarimasi',
      kind: 'fine',
      amountMinor: '50000',
      isActive: true,
    });
    const args = prisma.client.hrBonusFineRule.create.mock.calls[0]?.[0] as {
      data: { amountMinor: bigint; condition: unknown; kind: string };
    };
    expect(args.data.amountMinor).toBe(50_000n);
    expect(args.data.kind).toBe('fine');
    expect(args.data.condition).toEqual({ type: 'checkbox' });
  });
});

describe('HrBonusFineRuleService.applyRule', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineRuleService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineRuleService(prisma as any);
  });

  it('writes a source=rule ledger row snapshotting the rule amount + kind', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({
      id: 'r-1',
      accountId: 'acc1',
      name: 'Oylik bonus',
      kind: 'bonus',
      amountMinor: 300_000n,
      isActive: true,
    });
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.client.hrBonusFineLog.create.mockResolvedValue({ id: 'bf-1' });

    await svc.applyRule('acc1', 'admin-1', { ruleId: 'r-1', employeeId: 'emp-1' });

    const args = prisma.client.hrBonusFineLog.create.mock.calls[0]?.[0] as {
      data: {
        source: string;
        kind: string;
        amountMinor: bigint;
        ruleId: string;
        createdById: string;
        reason: string;
      };
    };
    expect(args.data.source).toBe('rule');
    expect(args.data.kind).toBe('bonus');
    expect(args.data.amountMinor).toBe(300_000n);
    expect(args.data.ruleId).toBe('r-1');
    expect(args.data.createdById).toBe('admin-1');
    expect(args.data.reason).toBe('Oylik bonus'); // falls back to rule name
  });

  it('custom reason overrides rule name', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({
      id: 'r-1',
      accountId: 'acc1',
      name: 'Oylik bonus',
      kind: 'bonus',
      amountMinor: 100n,
      isActive: true,
    });
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.client.hrBonusFineLog.create.mockResolvedValue({ id: 'bf-1' });

    await svc.applyRule('acc1', 'admin-1', {
      ruleId: 'r-1',
      employeeId: 'emp-1',
      reason: 'May oyi uchun',
    });
    const args = prisma.client.hrBonusFineLog.create.mock.calls[0]?.[0] as {
      data: { reason: string };
    };
    expect(args.data.reason).toBe('May oyi uchun');
  });

  it('rejects applying an inactive rule', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({
      id: 'r-1',
      accountId: 'acc1',
      kind: 'bonus',
      amountMinor: 100n,
      isActive: false,
    });
    await expect(
      svc.applyRule('acc1', 'admin-1', { ruleId: 'r-1', employeeId: 'emp-1' }),
    ).rejects.toThrow(/Faol bo'lmagan/);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });

  it('rejects when rule not found', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue(null);
    await expect(
      svc.applyRule('acc1', 'admin-1', { ruleId: 'ghost', employeeId: 'emp-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects when employee not in account', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({
      id: 'r-1',
      accountId: 'acc1',
      kind: 'bonus',
      amountMinor: 100n,
      isActive: true,
    });
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(
      svc.applyRule('acc1', 'admin-1', { ruleId: 'r-1', employeeId: 'ghost' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('HrBonusFineRuleService.update / remove', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineRuleService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineRuleService(prisma as any);
  });

  it('update coerces amountMinor to BigInt', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({ id: 'r-1', accountId: 'acc1' });
    prisma.client.hrBonusFineRule.update.mockResolvedValue({});
    await svc.update('acc1', 'r-1', { amountMinor: '99900' });
    const args = prisma.client.hrBonusFineRule.update.mock.calls[0]?.[0] as {
      data: { amountMinor: bigint };
    };
    expect(args.data.amountMinor).toBe(99_900n);
  });

  it('remove throws NotFound for missing rule', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue(null);
    await expect(svc.remove('acc1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  it('remove SOFT-deletes existing rule (deletedAt set, no hard delete) — §13.11', async () => {
    prisma.client.hrBonusFineRule.findFirst.mockResolvedValue({ id: 'r-1', accountId: 'acc1' });
    prisma.client.hrBonusFineRule.update.mockResolvedValue({});
    const result = await svc.remove('acc1', 'r-1');
    expect(result).toEqual({ ok: true });
    expect(prisma.client.hrBonusFineRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.client.hrBonusFineRule.delete).not.toHaveBeenCalled();
  });
});
