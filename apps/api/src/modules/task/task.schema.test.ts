import { describe, expect, it } from 'vitest';
import {
  CreateTaskSchema,
  TaskFilterSchema,
  TransitionStatusSchema,
  UpdateTaskSchema,
} from './task.schema.js';

const uuid = () => crypto.randomUUID();

describe('CreateTaskSchema', () => {
  it('accepts a minimal valid payload (title only)', () => {
    const r = CreateTaskSchema.safeParse({ title: 'Fix the bug' });
    if (!r.success) throw r.error;
    expect(r.data.status).toBe('open');
    expect(r.data.priority).toBe('normal');
  });

  it('rejects empty title', () => {
    expect(CreateTaskSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects title longer than 255 chars', () => {
    expect(CreateTaskSchema.safeParse({ title: 'a'.repeat(256) }).success).toBe(false);
  });

  it('accepts all valid statuses', () => {
    for (const status of ['open', 'in_progress', 'done', 'cancelled'] as const) {
      const r = CreateTaskSchema.safeParse({ title: 'T', status });
      expect(r.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(CreateTaskSchema.safeParse({ title: 'T', status: 'pending' }).success).toBe(false);
  });

  it('accepts all valid priorities', () => {
    for (const priority of ['low', 'normal', 'high', 'urgent'] as const) {
      const r = CreateTaskSchema.safeParse({ title: 'T', priority });
      expect(r.success).toBe(true);
    }
  });

  it('rejects invalid priority', () => {
    expect(CreateTaskSchema.safeParse({ title: 'T', priority: 'critical' }).success).toBe(false);
  });

  it('treats empty-string description as null (form-friendly)', () => {
    const r = CreateTaskSchema.safeParse({ title: 'T', description: '' });
    if (!r.success) throw r.error;
    expect(r.data.description).toBeNull();
  });

  it('coerces dueAt from ISO string to Date', () => {
    const r = CreateTaskSchema.safeParse({ title: 'T', dueAt: '2026-05-01T00:00:00Z' });
    if (!r.success) throw r.error;
    expect(r.data.dueAt).toBeInstanceOf(Date);
  });

  it('accepts valid entity enum value', () => {
    const r = CreateTaskSchema.safeParse({ title: 'T', entity: 'Demand', entityId: uuid() });
    expect(r.success).toBe(true);
  });

  it('rejects invalid entity value', () => {
    expect(CreateTaskSchema.safeParse({ title: 'T', entity: 'FakeEntity' }).success).toBe(false);
  });

  it('treats empty-string entity as null (form-friendly)', () => {
    const r = CreateTaskSchema.safeParse({ title: 'T', entity: '' });
    if (!r.success) throw r.error;
    expect(r.data.entity).toBeNull();
  });

  it('rejects invalid assigneeId UUID', () => {
    expect(CreateTaskSchema.safeParse({ title: 'T', assigneeId: 'not-uuid' }).success).toBe(false);
  });

  it('accepts a full valid payload', () => {
    const r = CreateTaskSchema.safeParse({
      title: 'Review contract',
      description: 'Please review carefully',
      assigneeId: uuid(),
      entity: 'Opportunity',
      entityId: uuid(),
      status: 'in_progress',
      priority: 'high',
      dueAt: '2026-05-10T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });
});

describe('UpdateTaskSchema', () => {
  it('every field except version is optional (version-only payload accepted)', () => {
    expect(UpdateTaskSchema.safeParse({ version: 1 }).success).toBe(true);
  });

  it('REQUIRES version — optimistic-lock token cannot be silently omitted', () => {
    // The lost-update guard is bypassable only if version is absent; the schema
    // must reject an update with no version (regression-lock for the lock rollout).
    expect(UpdateTaskSchema.safeParse({}).success).toBe(false);
    expect(UpdateTaskSchema.safeParse({ priority: 'urgent' }).success).toBe(false);
  });

  it('preserves description empty-as-null behavior', () => {
    const r = UpdateTaskSchema.safeParse({ version: 1, description: '' });
    if (!r.success) throw r.error;
    expect(r.data.description).toBeNull();
  });

  it('accepts single priority update', () => {
    const r = UpdateTaskSchema.safeParse({ version: 1, priority: 'urgent' });
    if (!r.success) throw r.error;
    expect(r.data.priority).toBe('urgent');
  });
});

describe('TransitionStatusSchema', () => {
  it('accepts status transition to done', () => {
    const r = TransitionStatusSchema.safeParse({ status: 'done' });
    if (!r.success) throw r.error;
    expect(r.data.status).toBe('done');
  });

  it('accepts completedAtOverride ISO string', () => {
    const r = TransitionStatusSchema.safeParse({
      status: 'cancelled',
      completedAtOverride: '2026-04-26T09:00:00Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.completedAtOverride).toBeInstanceOf(Date);
  });

  it('rejects invalid status', () => {
    expect(TransitionStatusSchema.safeParse({ status: 'deferred' }).success).toBe(false);
  });

  it('requires status field', () => {
    expect(TransitionStatusSchema.safeParse({}).success).toBe(false);
  });
});

describe('TaskFilterSchema', () => {
  it('defaults limit to 50 and ownership to all', () => {
    const r = TaskFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.ownership).toBe('all');
  });

  it('coerces archived from string', () => {
    const r = TaskFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });

  it('rejects limit above max (500)', () => {
    expect(TaskFilterSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it('accepts mine / team / all ownership values', () => {
    for (const ownership of ['mine', 'team', 'all'] as const) {
      expect(TaskFilterSchema.safeParse({ ownership }).success).toBe(true);
    }
  });

  it('coerces dueBefore from ISO string', () => {
    const r = TaskFilterSchema.safeParse({ dueBefore: '2026-04-30T23:59:59Z' });
    if (!r.success) throw r.error;
    expect(r.data.dueBefore).toBeInstanceOf(Date);
  });

  it('accepts status + priority combo filter', () => {
    const r = TaskFilterSchema.safeParse({ status: 'open', priority: 'urgent' });
    expect(r.success).toBe(true);
  });

  it('coerces createdAt period range from ISO strings', () => {
    const r = TaskFilterSchema.safeParse({
      dateFrom: '2026-04-01T00:00:00Z',
      dateTo: '2026-04-30T23:59:59Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.dateFrom).toBeInstanceOf(Date);
    expect(r.data.dateTo).toBeInstanceOf(Date);
  });

  it('coerces dueAt range (dueFrom/dueTo) from ISO strings', () => {
    const r = TaskFilterSchema.safeParse({
      dueFrom: '2026-05-01T00:00:00Z',
      dueTo: '2026-05-31T00:00:00Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.dueFrom).toBeInstanceOf(Date);
    expect(r.data.dueTo).toBeInstanceOf(Date);
  });

  it('coerces updated period range from ISO strings', () => {
    const r = TaskFilterSchema.safeParse({
      updatedFrom: '2026-04-01T00:00:00Z',
      updatedTo: '2026-04-30T23:59:59Z',
    });
    if (!r.success) throw r.error;
    expect(r.data.updatedFrom).toBeInstanceOf(Date);
    expect(r.data.updatedTo).toBeInstanceOf(Date);
  });

  it('accepts typeId + agentId filters', () => {
    const r = TaskFilterSchema.safeParse({ typeId: uuid(), agentId: uuid() });
    expect(r.success).toBe(true);
  });

  it('accepts agent sort key (relational orderBy)', () => {
    const r = TaskFilterSchema.safeParse({ sortBy: 'agent', sortDir: 'asc' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('agent');
  });

  it('accepts updatedAt sort key', () => {
    const r = TaskFilterSchema.safeParse({ sortBy: 'updatedAt' });
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('updatedAt');
  });

  it('rejects unknown sort key', () => {
    expect(TaskFilterSchema.safeParse({ sortBy: 'random' }).success).toBe(false);
  });
});
