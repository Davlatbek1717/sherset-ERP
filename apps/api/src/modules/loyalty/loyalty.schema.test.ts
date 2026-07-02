import { describe, expect, it } from 'vitest';
import {
  BonusOperationFilterSchema,
  BonusProgramFilterSchema,
  BonusTransactionStatusSchema,
  BonusTransactionTypeSchema,
  CreateBonusOperationSchema,
  CreateBonusProgramSchema,
  EarnRateRuleSchema,
  RedeemBonusSchema,
  UpdateBonusProgramSchema,
} from './loyalty.schema.js';

describe('BonusTransactionTypeSchema', () => {
  it.each(['EARNING', 'SPENDING'])('accepts %s', (t) => {
    expect(BonusTransactionTypeSchema.safeParse(t).success).toBe(true);
  });
  it('rejects unknown', () => {
    expect(BonusTransactionTypeSchema.safeParse('REFUND').success).toBe(false);
  });
});

describe('BonusTransactionStatusSchema', () => {
  it.each(['COMMITTED', 'PENDING', 'CANCELLED'])('accepts %s', (s) => {
    expect(BonusTransactionStatusSchema.safeParse(s).success).toBe(true);
  });
});

describe('EarnRateRuleSchema', () => {
  it('accepts an "all" rule', () => {
    const r = EarnRateRuleSchema.safeParse({ predicate: 'all', ratePerUnit: '0.05' });
    expect(r.success).toBe(true);
  });

  it('rejects rate with too many decimals', () => {
    expect(
      EarnRateRuleSchema.safeParse({ predicate: 'all', ratePerUnit: '0.1234567' }).success,
    ).toBe(false);
  });

  it('accepts productFolder rule with folderIds', () => {
    expect(
      EarnRateRuleSchema.safeParse({
        predicate: 'productFolder',
        ratePerUnit: '0.1',
        folderIds: ['00000000-0000-0000-0000-000000000001'],
      }).success,
    ).toBe(true);
  });

  it('accepts productTags rule', () => {
    expect(
      EarnRateRuleSchema.safeParse({
        predicate: 'productTags',
        ratePerUnit: '0.05',
        tags: ['featured'],
      }).success,
    ).toBe(true);
  });
});

describe('CreateBonusProgramSchema', () => {
  it('accepts minimal payload', () => {
    const r = CreateBonusProgramSchema.safeParse({ name: 'VIP' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe('UZS');
      expect(r.data.transactionType).toBe('EARNING');
      expect(r.data.allAgents).toBe(true);
    }
  });

  it('rejects empty name', () => {
    expect(CreateBonusProgramSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts earn rate rules', () => {
    const r = CreateBonusProgramSchema.safeParse({
      name: 'VIP',
      earnRateRules: [{ predicate: 'all', ratePerUnit: '0.05' }],
    });
    expect(r.success).toBe(true);
  });
});

describe('UpdateBonusProgramSchema', () => {
  it('accepts partial', () => {
    expect(UpdateBonusProgramSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe('CreateBonusOperationSchema', () => {
  const base = {
    agentId: '00000000-0000-0000-0000-000000000001',
    transactionType: 'EARNING' as const,
    bonusValue: 100,
  };

  it('accepts EARNING with positive value', () => {
    expect(CreateBonusOperationSchema.safeParse(base).success).toBe(true);
  });

  it('accepts SPENDING with negative value', () => {
    expect(
      CreateBonusOperationSchema.safeParse({
        ...base,
        transactionType: 'SPENDING',
        bonusValue: -50,
      }).success,
    ).toBe(true);
  });

  it('coerces bonusValue from string', () => {
    const r = CreateBonusOperationSchema.safeParse({ ...base, bonusValue: '200' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bonusValue).toBe(200);
  });
});

describe('RedeemBonusSchema', () => {
  it('accepts a valid redeem payload', () => {
    const r = RedeemBonusSchema.safeParse({
      agentId: '00000000-0000-0000-0000-000000000001',
      bonusValue: 100,
    });
    expect(r.success).toBe(true);
  });

  it('rejects bonusValue < 1', () => {
    expect(
      RedeemBonusSchema.safeParse({
        agentId: '00000000-0000-0000-0000-000000000001',
        bonusValue: 0,
      }).success,
    ).toBe(false);
  });
});

describe('Filter schemas', () => {
  it('BonusProgramFilterSchema defaults', () => {
    const r = BonusProgramFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('BonusOperationFilterSchema accepts filter set', () => {
    const r = BonusOperationFilterSchema.safeParse({
      transactionType: 'EARNING',
      transactionStatus: 'COMMITTED',
    });
    expect(r.success).toBe(true);
  });
});
