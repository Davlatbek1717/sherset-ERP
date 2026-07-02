import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrSalaryService } from './hr-salary.service.js';

function makePrisma() {
  return {
    client: {
      hrSalaryConfig: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    },
  };
}

describe('HrSalaryService.get', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrSalaryService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrSalaryService(prisma as any);
  });

  it('returns yangibolim defaults when no row exists (updatedAt=null)', async () => {
    prisma.client.hrSalaryConfig.findUnique.mockResolvedValue(null);
    const dto = await svc.get('acc1');
    expect(dto.fixWeight).toBe(0.7);
    expect(dto.kpiWeight).toBe(0.2);
    expect(dto.bonusWeight).toBe(0.1);
    expect(dto.monthlySalesTargetMinor).toBe('2000000000');
    expect(dto.kpiTiers).toHaveLength(4);
    expect(dto.updatedAt).toBeNull();
  });

  it('maps DB row to DTO with money-as-string + Decimal-as-number', async () => {
    prisma.client.hrSalaryConfig.findUnique.mockResolvedValue({
      fixWeight: { toString: () => '0.60' } as never,
      kpiWeight: { toString: () => '0.30' } as never,
      bonusWeight: { toString: () => '0.10' } as never,
      monthlySalesTarget: 30_000_000_00n,
      monthlyKpiBudget: 3_000_000_00n,
      commissionPercent: { toString: () => '2.00' } as never,
      kpiTiers: [{ min: 60, payout: 25 }],
      updatedAt: new Date('2026-05-22T10:00:00Z'),
    });
    const dto = await svc.get('acc1');
    expect(dto.fixWeight).toBe(0.6);
    expect(dto.monthlySalesTargetMinor).toBe('3000000000');
    expect(dto.kpiTiers).toEqual([{ min: 60, payout: 25 }]);
    expect(dto.updatedAt).toBe('2026-05-22T10:00:00.000Z');
  });
});

describe('HrSalaryService.getResolved', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrSalaryService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrSalaryService(prisma as any);
  });

  it('returns raw BigInt + parsed tiers (defaults when missing)', async () => {
    prisma.client.hrSalaryConfig.findUnique.mockResolvedValue(null);
    const r = await svc.getResolved('acc1');
    expect(typeof r.monthlySalesTargetMinor).toBe('bigint');
    expect(r.monthlySalesTargetMinor).toBe(2_000_000_000n);
    expect(r.kpiTiers).toHaveLength(4);
  });

  it('parses malformed tiers JSON → falls back to defaults', async () => {
    prisma.client.hrSalaryConfig.findUnique.mockResolvedValue({
      fixWeight: { toString: () => '0.7' } as never,
      kpiWeight: { toString: () => '0.2' } as never,
      bonusWeight: { toString: () => '0.1' } as never,
      monthlySalesTarget: 1n,
      monthlyKpiBudget: 1n,
      commissionPercent: { toString: () => '1.5' } as never,
      kpiTiers: 'not-an-array',
      updatedAt: new Date(),
    });
    const r = await svc.getResolved('acc1');
    expect(r.kpiTiers).toHaveLength(4); // default fallback
  });

  it('filters partial tier objects (missing payout) from parse', async () => {
    prisma.client.hrSalaryConfig.findUnique.mockResolvedValue({
      fixWeight: { toString: () => '0.7' } as never,
      kpiWeight: { toString: () => '0.2' } as never,
      bonusWeight: { toString: () => '0.1' } as never,
      monthlySalesTarget: 1n,
      monthlyKpiBudget: 1n,
      commissionPercent: { toString: () => '1.5' } as never,
      kpiTiers: [{ min: 50, payout: 20 }, { min: 75 }, { payout: 100 }],
      updatedAt: new Date(),
    });
    const r = await svc.getResolved('acc1');
    expect(r.kpiTiers).toEqual([{ min: 50, payout: 20 }]);
  });
});

describe('HrSalaryService.upsert', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrSalaryService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrSalaryService(prisma as any);
  });

  it('upserts with BigInt-coerced money + Decimal weights', async () => {
    prisma.client.hrSalaryConfig.upsert.mockResolvedValue({
      fixWeight: { toString: () => '0.7' } as never,
      kpiWeight: { toString: () => '0.2' } as never,
      bonusWeight: { toString: () => '0.1' } as never,
      monthlySalesTarget: 25_000_000_00n,
      monthlyKpiBudget: 2_500_000_00n,
      commissionPercent: { toString: () => '1.5' } as never,
      kpiTiers: [{ min: 50, payout: 20 }],
      updatedAt: new Date('2026-05-22T11:00:00Z'),
    });

    await svc.upsert('acc1', {
      fixWeight: 0.7,
      kpiWeight: 0.2,
      bonusWeight: 0.1,
      monthlySalesTarget: '2500000000',
      monthlyKpiBudget: '250000000',
      commissionPercent: 1.5,
      kpiTiers: [{ min: 50, payout: 20 }],
    });

    const upsertArgs = prisma.client.hrSalaryConfig.upsert.mock.calls[0]?.[0] as {
      where: { accountId: string };
      create: { monthlySalesTarget: bigint };
      update: { monthlySalesTarget: bigint };
    };
    expect(upsertArgs.where.accountId).toBe('acc1');
    expect(upsertArgs.create.monthlySalesTarget).toBe(2_500_000_000n);
    expect(upsertArgs.update.monthlySalesTarget).toBe(2_500_000_000n);
  });
});
