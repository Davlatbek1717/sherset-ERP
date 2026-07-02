import { describe, expect, it } from 'vitest';
import {
  CreateProcessingStageSchema,
  ProcessingStageFilterSchema,
  UpdateProcessingStageSchema,
} from './processing-stage.schema.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('§126 CreateProcessingStageSchema (standalone Этап)', () => {
  it('accepts a minimal stage with defaults', () => {
    const r = CreateProcessingStageSchema.parse({ name: 'Kesish' });
    expect(r.name).toBe('Kesish');
    expect(r.laborCostMinor).toBe('0');
    expect(r.materialMarkup).toBe(0);
    expect(r.allPerformers).toBe(true);
    expect(r.distributionRequired).toBe(false);
    expect(r.standardHourCostMinor).toBe('0');
    expect(r.shared).toBe(false);
    expect(r.performers).toEqual([]);
  });

  it('rejects empty name / name>255 / code>50', () => {
    expect(CreateProcessingStageSchema.safeParse({ name: '' }).success).toBe(false);
    expect(CreateProcessingStageSchema.safeParse({ name: 'z'.repeat(256) }).success).toBe(false);
    expect(CreateProcessingStageSchema.safeParse({ name: 'x', code: 'z'.repeat(51) }).success).toBe(
      false,
    );
  });

  it('money fields are tiyin integer strings (reject decimals/negatives)', () => {
    expect(
      CreateProcessingStageSchema.safeParse({ name: 'x', laborCostMinor: '12.5' }).success,
    ).toBe(false);
    expect(
      CreateProcessingStageSchema.safeParse({ name: 'x', standardHourCostMinor: '-1' }).success,
    ).toBe(false);
    const ok = CreateProcessingStageSchema.parse({
      name: 'x',
      laborCostMinor: 250000,
      standardHourCostMinor: '90000',
    });
    expect(ok.laborCostMinor).toBe('250000');
    expect(ok.standardHourCostMinor).toBe('90000');
  });

  it('materialMarkup capped 0..1000', () => {
    expect(CreateProcessingStageSchema.safeParse({ name: 'x', materialMarkup: 1001 }).success).toBe(
      false,
    );
    expect(
      CreateProcessingStageSchema.parse({ name: 'x', materialMarkup: 1000 }).materialMarkup,
    ).toBe(1000);
  });

  it('bool flags coerce from string; performers uuid array', () => {
    const r = CreateProcessingStageSchema.parse({
      name: 'x',
      allPerformers: 'false',
      distributionRequired: '1',
      performers: [UUID],
    });
    expect(r.allPerformers).toBe(false);
    expect(r.distributionRequired).toBe(true);
    expect(r.performers).toEqual([UUID]);
    expect(CreateProcessingStageSchema.safeParse({ name: 'x', performers: ['nope'] }).success).toBe(
      false,
    );
  });

  it('materialStoreId nullish uuid', () => {
    expect(
      CreateProcessingStageSchema.parse({ name: 'x', materialStoreId: null }).materialStoreId,
    ).toBeNull();
    expect(
      CreateProcessingStageSchema.safeParse({ name: 'x', materialStoreId: 'bad' }).success,
    ).toBe(false);
  });
});

describe('§126 UpdateProcessingStageSchema — partial + required version (optimistic-lock)', () => {
  it('requires version (lost-update guard)', () => {
    // version is REQUIRED on Update (absent on Create) — the edit form must
    // echo the version it loaded so the service can run the versioned update.
    expect(UpdateProcessingStageSchema.safeParse({}).success).toBe(false);
    expect(UpdateProcessingStageSchema.safeParse({ name: 'Yangi' }).success).toBe(false);
  });
  it('accepts {version} alone', () => {
    expect(UpdateProcessingStageSchema.parse({ version: 0 })).toEqual({ version: 0 });
  });
  it('accepts a partial update carrying version', () => {
    const r = UpdateProcessingStageSchema.parse({ version: 3, name: 'Yangi' });
    expect(r.name).toBe('Yangi');
    expect(r.version).toBe(3);
  });
  it('rejects a negative / non-integer version', () => {
    expect(UpdateProcessingStageSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateProcessingStageSchema.safeParse({ version: 1.5 }).success).toBe(false);
  });
});

describe('§126 ProcessingStageFilterSchema', () => {
  it('defaults', () => {
    const r = ProcessingStageFilterSchema.parse({});
    expect(r.limit).toBe(25);
    expect(r.sortBy).toBe('name');
    expect(r.sortDir).toBe('asc');
  });
  it('archived from string + limit cap', () => {
    expect(ProcessingStageFilterSchema.parse({ archived: 'true' }).archived).toBe(true);
    expect(ProcessingStageFilterSchema.safeParse({ limit: 251 }).success).toBe(false);
  });
});
