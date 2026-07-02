import { describe, expect, it } from 'vitest';
import {
  MarkReadSchema,
  NotificationFilterSchema,
  NotificationKind,
} from './notification.schema.js';

const uuid = () => crypto.randomUUID();

describe('NotificationKind', () => {
  it('accepts all 9 valid kinds', () => {
    const kinds = [
      'task_assigned',
      'task_due_soon',
      'task_overdue',
      'opportunity_won',
      'opportunity_lost',
      'invoice_paid',
      'invoice_overdue',
      'mention',
      'system',
    ] as const;
    for (const k of kinds) {
      expect(NotificationKind.safeParse(k).success).toBe(true);
    }
  });

  it('rejects unknown kind', () => {
    expect(NotificationKind.safeParse('unknown_kind').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(NotificationKind.safeParse('').success).toBe(false);
  });
});

describe('NotificationFilterSchema', () => {
  it('defaults limit to 30', () => {
    const r = NotificationFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(30);
  });

  it('coerces unreadOnly from string "true"', () => {
    const r = NotificationFilterSchema.safeParse({ unreadOnly: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.unreadOnly).toBe(true);
  });

  it('coerces unreadOnly from string "false"', () => {
    const r = NotificationFilterSchema.safeParse({ unreadOnly: 'false' });
    if (!r.success) throw r.error;
    expect(r.data.unreadOnly).toBe(false);
  });

  it('accepts boolean unreadOnly directly', () => {
    const r = NotificationFilterSchema.safeParse({ unreadOnly: true });
    if (!r.success) throw r.error;
    expect(r.data.unreadOnly).toBe(true);
  });

  it('accepts a valid kind filter', () => {
    const r = NotificationFilterSchema.safeParse({ kind: 'task_assigned' });
    if (!r.success) throw r.error;
    expect(r.data.kind).toBe('task_assigned');
  });

  it('rejects invalid kind filter', () => {
    expect(NotificationFilterSchema.safeParse({ kind: 'not_a_kind' }).success).toBe(false);
  });

  it('coerces limit from string', () => {
    const r = NotificationFilterSchema.safeParse({ limit: '10' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(10);
  });

  it('rejects limit above max (500)', () => {
    expect(NotificationFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('rejects limit < 1', () => {
    expect(NotificationFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('accepts a valid cursor UUID', () => {
    const id = uuid();
    const r = NotificationFilterSchema.safeParse({ cursor: id });
    if (!r.success) throw r.error;
    expect(r.data.cursor).toBe(id);
  });

  it('rejects invalid cursor (not UUID)', () => {
    expect(NotificationFilterSchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts full valid filter', () => {
    const r = NotificationFilterSchema.safeParse({
      unreadOnly: 'true',
      kind: 'opportunity_won',
      limit: '5',
      cursor: uuid(),
    });
    expect(r.success).toBe(true);
  });
});

describe('MarkReadSchema', () => {
  it('accepts array of 1 UUID', () => {
    const r = MarkReadSchema.safeParse({ ids: [uuid()] });
    expect(r.success).toBe(true);
  });

  it('accepts array of 100 UUIDs', () => {
    const ids = Array.from({ length: 100 }, () => uuid());
    expect(MarkReadSchema.safeParse({ ids }).success).toBe(true);
  });

  it('rejects empty array', () => {
    expect(MarkReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejects array with 101 entries', () => {
    const ids = Array.from({ length: 101 }, () => uuid());
    expect(MarkReadSchema.safeParse({ ids }).success).toBe(false);
  });

  it('rejects array with non-UUID entry', () => {
    expect(MarkReadSchema.safeParse({ ids: ['not-uuid'] }).success).toBe(false);
  });

  it('rejects missing ids field', () => {
    expect(MarkReadSchema.safeParse({}).success).toBe(false);
  });
});
