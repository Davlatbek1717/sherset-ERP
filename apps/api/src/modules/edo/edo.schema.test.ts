import { describe, expect, it } from 'vitest';
import {
  CreateEdoSubmissionSchema,
  EdoProviderSchema,
  EdoSourceEntitySchema,
  EdoSubmissionStatusSchema,
  ListEdoSubmissionsSchema,
  SaveEdoConfigSchema,
} from './edo.schema.js';

describe('EdoProviderSchema', () => {
  it.each(['didox', 'edocs', 'soliq_direct'])('accepts %s', (p) => {
    expect(EdoProviderSchema.safeParse(p).success).toBe(true);
  });
});

describe('EdoSubmissionStatusSchema', () => {
  it.each(['draft', 'signed', 'sent', 'delivered', 'confirmed', 'rejected', 'cancelled'])(
    'accepts %s',
    (s) => {
      expect(EdoSubmissionStatusSchema.safeParse(s).success).toBe(true);
    },
  );

  it('rejects unknown', () => {
    expect(EdoSubmissionStatusSchema.safeParse('paid').success).toBe(false);
  });
});

describe('EdoSourceEntitySchema', () => {
  it.each(['FactureOut', 'Demand', 'InvoiceOut'])('accepts %s', (e) => {
    expect(EdoSourceEntitySchema.safeParse(e).success).toBe(true);
  });
});

describe('SaveEdoConfigSchema', () => {
  const base = {
    stir: '300123456',
    orgNameCyrl: 'Test MChJ',
    apiBaseUrl: 'https://didox.uz/api',
  };

  it('accepts a 9-digit STIR', () => {
    const r = SaveEdoConfigSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.provider).toBe('didox');
      expect(r.data.testMode).toBe(true);
    }
  });

  it('accepts a 14-digit STIR', () => {
    expect(SaveEdoConfigSchema.safeParse({ ...base, stir: '30012345678901' }).success).toBe(true);
  });

  it('rejects 10-digit STIR', () => {
    expect(SaveEdoConfigSchema.safeParse({ ...base, stir: '3001234567' }).success).toBe(false);
  });

  it('rejects invalid apiBaseUrl', () => {
    expect(SaveEdoConfigSchema.safeParse({ ...base, apiBaseUrl: 'not a url' }).success).toBe(false);
  });
});

describe('CreateEdoSubmissionSchema', () => {
  it('accepts InvoiceOut source', () => {
    const r = CreateEdoSubmissionSchema.safeParse({
      sourceEntity: 'InvoiceOut',
      sourceEntityId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown sourceEntity', () => {
    expect(
      CreateEdoSubmissionSchema.safeParse({
        sourceEntity: 'Demand2',
        sourceEntityId: '123e4567-e89b-12d3-a456-426614174000',
      }).success,
    ).toBe(false);
  });

  it('rejects bad uuid', () => {
    expect(
      CreateEdoSubmissionSchema.safeParse({
        sourceEntity: 'InvoiceOut',
        sourceEntityId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

describe('ListEdoSubmissionsSchema', () => {
  it('uses default limit 50', () => {
    const r = ListEdoSubmissionsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('rejects limit > 500', () => {
    expect(ListEdoSubmissionsSchema.safeParse({ limit: 600 }).success).toBe(false);
  });
});
