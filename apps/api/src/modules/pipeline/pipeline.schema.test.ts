import { describe, expect, it } from 'vitest';
import {
  CreatePipelineSchema,
  PipelineFilterSchema,
  StageInputSchema,
  UpdatePipelineSchema,
} from './pipeline.schema.js';

describe('StageInputSchema', () => {
  it('accepts a minimal stage', () => {
    const r = StageInputSchema.safeParse({ name: 'Yangi' });
    if (!r.success) throw r.error;
    expect(r.data.type).toBe('open');
    expect(r.data.probability).toBe(50);
  });

  it('rejects invalid type', () => {
    expect(StageInputSchema.safeParse({ name: 'X', type: 'unknown' }).success).toBe(false);
  });

  it('rejects probability > 100', () => {
    expect(StageInputSchema.safeParse({ name: 'X', probability: 150 }).success).toBe(false);
  });

  it('rejects probability < 0', () => {
    expect(StageInputSchema.safeParse({ name: 'X', probability: -1 }).success).toBe(false);
  });

  it('rejects malformed color', () => {
    expect(StageInputSchema.safeParse({ name: 'X', color: 'red' }).success).toBe(false);
  });

  it('accepts valid hex color', () => {
    const r = StageInputSchema.safeParse({ name: 'X', color: '#3B82F6' });
    if (!r.success) throw r.error;
    expect(r.data.color).toBe('#3B82F6');
  });

  it('treats empty-string color as null', () => {
    const r = StageInputSchema.safeParse({ name: 'X', color: '' });
    if (!r.success) throw r.error;
    expect(r.data.color).toBeNull();
  });
});

describe('CreatePipelineSchema', () => {
  it('accepts a valid pipeline with stages', () => {
    const r = CreatePipelineSchema.safeParse({
      name: 'Asosiy',
      stages: [
        { name: 'Yangi', type: 'open', probability: 10 },
        { name: 'Yutuq', type: 'won', probability: 100 },
      ],
    });
    if (!r.success) throw r.error;
    expect(r.data.isDefault).toBe(false);
    expect(r.data.stages).toHaveLength(2);
  });

  it('rejects empty stages array', () => {
    expect(CreatePipelineSchema.safeParse({ name: 'X', stages: [] }).success).toBe(false);
  });

  it('rejects pipeline with > 20 stages', () => {
    const stages = Array.from({ length: 21 }, (_, i) => ({ name: `S${i}` }));
    expect(CreatePipelineSchema.safeParse({ name: 'X', stages }).success).toBe(false);
  });

  it('rejects 256-char name', () => {
    expect(
      CreatePipelineSchema.safeParse({ name: 'a'.repeat(256), stages: [{ name: 'S' }] }).success,
    ).toBe(false);
  });
});

describe('UpdatePipelineSchema', () => {
  it('every field except version is optional (version-only payload accepted)', () => {
    expect(UpdatePipelineSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('REQUIRES version — optimistic-lock token cannot be silently omitted', () => {
    expect(UpdatePipelineSchema.safeParse({}).success).toBe(false);
    expect(UpdatePipelineSchema.safeParse({ isDefault: true }).success).toBe(false);
  });

  it('accepts isDefault toggle alone', () => {
    const r = UpdatePipelineSchema.safeParse({ version: 1, isDefault: true });
    if (!r.success) throw r.error;
    expect(r.data.isDefault).toBe(true);
  });
});

describe('PipelineFilterSchema', () => {
  it('defaults limit to 50', () => {
    const r = PipelineFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces archived from string', () => {
    const r = PipelineFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });
});
