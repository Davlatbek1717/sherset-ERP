import { describe, expect, it } from 'vitest';
import {
  CreateReasonCodeSchema,
  ReasonCodeFilterSchema,
  UpdateReasonCodeSchema,
} from './reason-code.schema.js';

describe('CreateReasonCodeSchema', () => {
  it('accepts a minimal payload', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: "O'g'irlik" }).success).toBe(true);
  });

  it('rejects an empty label', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: '' }).success).toBe(false);
  });

  it('rejects label > 100 chars', () => {
    expect(CreateReasonCodeSchema.safeParse({ label: 'a'.repeat(101) }).success).toBe(false);
  });

  it('defaults active to true', () => {
    const r = CreateReasonCodeSchema.safeParse({ label: 'Buzilgan' });
    if (!r.success) throw r.error;
    expect(r.data.active).toBe(true);
  });
});

describe('UpdateReasonCodeSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(UpdateReasonCodeSchema.safeParse({}).success).toBe(true);
  });
});

describe('ReasonCodeFilterSchema', () => {
  it('parses activeOnly from string', () => {
    const r = ReasonCodeFilterSchema.safeParse({ activeOnly: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.activeOnly).toBe(true);
  });
});
