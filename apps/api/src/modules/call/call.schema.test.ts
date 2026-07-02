import { describe, expect, it } from 'vitest';
import { CallFilterSchema, CreateCallSchema, UpdateCallSchema } from './call.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateCallSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = CreateCallSchema.safeParse({
      direction: 'in',
      startedAt: '2026-04-25T10:00:00Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.channel).toBe('call');
    expect(r.data.status).toBe('completed');
  });

  it('coerces startedAt from string to Date', () => {
    const r = CreateCallSchema.safeParse({
      direction: 'out',
      startedAt: '2026-04-25T10:00:00Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.startedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid direction', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'sideways',
        startedAt: '2026-04-25T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid channel', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'in',
        channel: 'fax',
        startedAt: '2026-04-25T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'in',
        status: 'busy',
        startedAt: '2026-04-25T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('accepts all enum variations', () => {
    const r = CreateCallSchema.safeParse({
      counterpartyId: uuid(),
      contactPersonId: uuid(),
      direction: 'out',
      channel: 'meeting',
      status: 'scheduled',
      startedAt: '2026-04-25T10:00:00Z',
      durationSec: 1800,
      externalNumber: '+998 90 123 45 67',
      summary: 'Diskussiya: yangi shartnoma shartlari',
    });
    expect(r.success).toBe(true);
  });

  it('treats empty-string summary as null (form-friendly)', () => {
    const r = CreateCallSchema.safeParse({
      direction: 'in',
      startedAt: '2026-04-25T10:00:00Z',
      summary: '',
    });
    if (!r.success) throw r.error;
    expect(r.data.summary).toBeNull();
  });

  it('rejects negative durationSec', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'in',
        startedAt: '2026-04-25T10:00:00Z',
        durationSec: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects durationSec > 86400 (more than a day)', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'in',
        startedAt: '2026-04-25T10:00:00Z',
        durationSec: 86401,
      }).success,
    ).toBe(false);
  });

  it('coerces durationSec from numeric string', () => {
    const r = CreateCallSchema.safeParse({
      direction: 'in',
      startedAt: '2026-04-25T10:00:00Z',
      durationSec: '120',
    });
    if (!r.success) throw r.error;
    expect(r.data.durationSec).toBe(120);
  });

  it('rejects invalid counterpartyId UUID', () => {
    expect(
      CreateCallSchema.safeParse({
        counterpartyId: 'not-a-uuid',
        direction: 'in',
        startedAt: '2026-04-25T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects 4001-char summary', () => {
    expect(
      CreateCallSchema.safeParse({
        direction: 'in',
        startedAt: '2026-04-25T10:00:00Z',
        summary: 'a'.repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe('UpdateCallSchema', () => {
  it('all fields optional', () => {
    expect(UpdateCallSchema.safeParse({}).success).toBe(true);
  });

  it('preserves summary-empty-as-null behavior', () => {
    const r = UpdateCallSchema.safeParse({ summary: '' });
    if (!r.success) throw r.error;
    expect(r.data.summary).toBeNull();
  });

  it('accepts a single direction update', () => {
    const r = UpdateCallSchema.safeParse({ direction: 'out' });
    if (!r.success) throw r.error;
    expect(r.data.direction).toBe('out');
  });
});

describe('CallFilterSchema', () => {
  it('defaults limit to 50', () => {
    const r = CallFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces archived from string', () => {
    const r = CallFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('rejects limit above max (500)', () => {
    expect(CallFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('coerces dateFrom and dateTo from ISO strings', () => {
    const r = CallFilterSchema.safeParse({
      dateFrom: '2026-04-01T00:00:00Z',
      dateTo: '2026-04-30T23:59:59Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('accepts direction + channel + status filters', () => {
    const r = CallFilterSchema.safeParse({
      direction: 'in',
      channel: 'sms',
      status: 'missed',
    });
    expect(r.success).toBe(true);
  });

  it('coerces updated date range from ISO strings', () => {
    const r = CallFilterSchema.safeParse({
      updatedFrom: '2026-04-01T00:00:00Z',
      updatedTo: '2026-04-30T23:59:59Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.updatedFrom).toBeInstanceOf(Date);
    expect(r.data.updatedTo).toBeInstanceOf(Date);
  });

  it('accepts ownerId filter', () => {
    const r = CallFilterSchema.safeParse({ ownerId: uuid() });
    expect(r.success).toBe(true);
  });

  it('accepts agent sort key (relational orderBy)', () => {
    const r = CallFilterSchema.safeParse({ sortBy: 'agent', sortDir: 'asc' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('agent');
  });

  it('accepts updatedAt sort key', () => {
    const r = CallFilterSchema.safeParse({ sortBy: 'updatedAt' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('updatedAt');
  });

  it('rejects unknown sort key', () => {
    expect(CallFilterSchema.safeParse({ sortBy: 'random' }).success).toBe(false);
  });
});
