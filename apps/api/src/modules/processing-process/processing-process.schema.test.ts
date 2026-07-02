import { describe, expect, it } from 'vitest';
import {
  CreateProcessingProcessSchema,
  ProcessingProcessFilterSchema,
  ProcessingStageInputSchema,
  SetProcessingStagesSchema,
  UpdateProcessingProcessSchema,
} from './processing-process.schema.js';

describe('ProcessingStageInputSchema', () => {
  it('accepts a valid stage', () => {
    const r = ProcessingStageInputSchema.parse({
      name: 'Kesish',
      position: 2,
      laborCostMinor: '150000',
      materialMarkup: 5,
    });
    expect(r.name).toBe('Kesish');
    expect(r.position).toBe(2);
    expect(r.laborCostMinor).toBe('150000');
    expect(r.materialMarkup).toBe(5);
  });

  it('applies defaults (position 0, default true, labor 0, markup 0, shared false)', () => {
    const r = ProcessingStageInputSchema.parse({ name: 'Yig‘ish' });
    expect(r.position).toBe(0);
    expect(r.default).toBe(true);
    expect(r.laborCostMinor).toBe('0');
    expect(r.materialMarkup).toBe(0);
    expect(r.shared).toBe(false);
  });

  it('§126 — allPerformers defaults true; nextPositionIndexes default []', () => {
    const def = ProcessingStageInputSchema.parse({ name: 'x' });
    expect(def.allPerformers).toBe(true);
    expect(def.nextPositionIndexes).toEqual([]);
    const off = ProcessingStageInputSchema.parse({ name: 'x', allPerformers: 'false' });
    expect(off.allPerformers).toBe(false);
  });

  it('§126 — references an existing standalone Этап via processingStageId (no name needed)', () => {
    const r = ProcessingStageInputSchema.parse({
      processingStageId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(r.processingStageId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(r.name).toBeUndefined();
    expect(ProcessingStageInputSchema.safeParse({ processingStageId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('§126 — rejects a position with neither processingStageId nor name', () => {
    expect(ProcessingStageInputSchema.safeParse({}).success).toBe(false);
    expect(ProcessingStageInputSchema.safeParse({ position: 1 }).success).toBe(false);
  });

  it('§126 — coerces multi-successor nextPositionIndexes (DAG)', () => {
    const r = ProcessingStageInputSchema.parse({
      name: 'fork',
      nextPositionIndexes: [1, '3'],
    });
    expect(r.nextPositionIndexes).toEqual([1, 3]);
    expect(
      ProcessingStageInputSchema.safeParse({ name: 'x', nextPositionIndexes: [-1] }).success,
    ).toBe(false);
  });

  it('coerces numeric laborCostMinor to string', () => {
    const r = ProcessingStageInputSchema.parse({ name: 'x', laborCostMinor: 250000 });
    expect(r.laborCostMinor).toBe('250000');
  });

  it('rejects a non-integer (decimal) laborCostMinor — money is tiyin', () => {
    expect(() =>
      ProcessingStageInputSchema.parse({ name: 'x', laborCostMinor: '12.50' }),
    ).toThrow();
  });

  it('rejects a negative laborCostMinor', () => {
    expect(() => ProcessingStageInputSchema.parse({ name: 'x', laborCostMinor: '-1' })).toThrow();
  });

  it('rejects an empty stage name', () => {
    expect(() => ProcessingStageInputSchema.parse({ name: '' })).toThrow();
  });

  it('rejects materialMarkup above the 1000% cap', () => {
    expect(() => ProcessingStageInputSchema.parse({ name: 'x', materialMarkup: 1001 })).toThrow();
  });

  it('parses default/shared booleans from "true"/"false" strings', () => {
    const r = ProcessingStageInputSchema.parse({
      name: 'x',
      default: 'false',
      shared: 'true',
    });
    expect(r.default).toBe(false);
    expect(r.shared).toBe(true);
  });
});

describe('SetProcessingStagesSchema', () => {
  it('rejects an empty stages array', () => {
    expect(() => SetProcessingStagesSchema.parse({ stages: [] })).toThrow();
  });

  it('accepts a non-empty stages array', () => {
    const r = SetProcessingStagesSchema.parse({ stages: [{ name: 'A' }, { name: 'B' }] });
    expect(r.stages).toHaveLength(2);
  });

  it('§126 — rejects more than 100 positions (moysklad 1–100 cap)', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `S${i}` }));
    expect(SetProcessingStagesSchema.safeParse({ stages: many }).success).toBe(false);
    const ok = Array.from({ length: 100 }, (_, i) => ({ name: `S${i}` }));
    expect(SetProcessingStagesSchema.safeParse({ stages: ok }).success).toBe(true);
  });
});

describe('CreateProcessingProcessSchema', () => {
  it('§126 — requires ≥1 position at creation (moysklad-faithful)', () => {
    expect(() => CreateProcessingProcessSchema.parse({ name: 'Non pishirish' })).toThrow();
    const r = CreateProcessingProcessSchema.parse({
      name: 'Non pishirish',
      stages: [{ name: 'Pishirish' }],
    });
    expect(r.name).toBe('Non pishirish');
    expect(r.shared).toBe(false);
    expect(r.stages).toHaveLength(1);
  });

  it('rejects an empty name', () => {
    expect(() =>
      CreateProcessingProcessSchema.parse({ name: '', stages: [{ name: 'A' }] }),
    ).toThrow();
  });

  it('rejects a name longer than 255 chars', () => {
    expect(() =>
      CreateProcessingProcessSchema.parse({ name: 'z'.repeat(256), stages: [{ name: 'A' }] }),
    ).toThrow();
  });

  it('rejects a code longer than 50 chars', () => {
    expect(() =>
      CreateProcessingProcessSchema.parse({
        name: 'x',
        code: 'z'.repeat(51),
        stages: [{ name: 'A' }],
      }),
    ).toThrow();
  });

  it('accepts nested stages', () => {
    const r = CreateProcessingProcessSchema.parse({
      name: 'x',
      stages: [
        { name: 'Tayyorlash', position: 0 },
        { name: 'Pishirish', position: 1, laborCostMinor: '500000' },
      ],
    });
    expect(r.stages).toHaveLength(2);
    expect(r.stages[1]?.laborCostMinor).toBe('500000');
  });

  it('accepts the universal «Внешний код» (externalCode)', () => {
    const r = CreateProcessingProcessSchema.parse({
      name: 'x',
      externalCode: 'TP-7',
      stages: [{ name: 'A' }],
    });
    expect(r.externalCode).toBe('TP-7');
  });
});

describe('UpdateProcessingProcessSchema — partial + optimistic-lock version', () => {
  it('accepts a version-only update (all content fields optional)', () => {
    const r = UpdateProcessingProcessSchema.parse({ version: 3 });
    expect(r.version).toBe(3);
    expect(r.name).toBeUndefined();
    expect(r.stages).toBeUndefined();
  });

  it('accepts a partial update carrying the loaded version', () => {
    const r = UpdateProcessingProcessSchema.parse({ name: 'Yangilangan', version: 1 });
    expect(r.name).toBe('Yangilangan');
    expect(r.version).toBe(1);
  });

  it('optimistic-lock: REQUIRES version (a stale form without it is rejected)', () => {
    expect(UpdateProcessingProcessSchema.safeParse({}).success).toBe(false);
    expect(UpdateProcessingProcessSchema.safeParse({ name: 'x' }).success).toBe(false);
  });

  it('optimistic-lock: version must be a non-negative integer', () => {
    expect(UpdateProcessingProcessSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(UpdateProcessingProcessSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(UpdateProcessingProcessSchema.safeParse({ version: 0 }).success).toBe(true);
  });

  it('optimistic-lock: version is absent on Create (only required on Update)', () => {
    expect('version' in CreateProcessingProcessSchema.shape).toBe(false);
  });
});

describe('ProcessingProcessFilterSchema', () => {
  it('applies defaults', () => {
    const r = ProcessingProcessFilterSchema.parse({});
    expect(r.limit).toBe(25);
    expect(r.sortBy).toBe('name');
    expect(r.sortDir).toBe('asc');
  });

  it('parses the archived flag from a string', () => {
    const r = ProcessingProcessFilterSchema.parse({ archived: 'true' });
    expect(r.archived).toBe(true);
  });

  it('rejects a limit above 250', () => {
    expect(() => ProcessingProcessFilterSchema.parse({ limit: 251 })).toThrow();
  });
});
