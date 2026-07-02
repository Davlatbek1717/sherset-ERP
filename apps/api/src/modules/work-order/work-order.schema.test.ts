import { describe, expect, it } from 'vitest';
import {
  BulkDeleteWorkOrderSchema,
  BulkTransitionWorkOrderSchema,
  CreateWorkOrderSchema,
  TransitionWorkOrderSchema,
  UpdateWorkOrderSchema,
  WorkOrderFilterSchema,
  WorkOrderStateSchema,
} from './work-order.schema.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID2 = '223e4567-e89b-12d3-a456-426614174001';

describe('WorkOrderStateSchema', () => {
  it('accepts all valid states', () => {
    for (const s of ['draft', 'in_progress', 'completed', 'cancelled'] as const) {
      expect(WorkOrderStateSchema.parse(s)).toBe(s);
    }
  });

  it('rejects invalid state', () => {
    expect(() => WorkOrderStateSchema.parse('unknown')).toThrow();
  });
});

describe('CreateWorkOrderSchema', () => {
  const base = { bomId: UUID, storeId: UUID2, plannedQty: '5' };

  it('accepts minimal valid input', () => {
    const r = CreateWorkOrderSchema.parse(base);
    expect(r.bomId).toBe(UUID);
    expect(r.storeId).toBe(UUID2);
    expect(r.plannedQty).toBe('5');
  });

  it('rejects non-decimal plannedQty', () => {
    expect(() => CreateWorkOrderSchema.parse({ ...base, plannedQty: 'abc' })).toThrow();
  });

  it('rejects invalid bomId', () => {
    expect(() => CreateWorkOrderSchema.parse({ ...base, bomId: 'not-uuid' })).toThrow();
  });

  it('accepts optional fields', () => {
    const r = CreateWorkOrderSchema.parse({
      ...base,
      name: 'ТЗ-2026-00001',
      plannedStartAt: '2026-05-01T00:00:00.000Z',
      description: 'Test order',
    });
    expect(r.name).toBe('ТЗ-2026-00001');
    expect(r.description).toBe('Test order');
  });

  it('accepts an ISO moment (Дата документа)', () => {
    const r = CreateWorkOrderSchema.parse({ ...base, moment: '2026-05-01T08:30:00.000Z' });
    expect(r.moment).toBe('2026-05-01T08:30:00.000Z');
  });

  it('treats moment as optional (omitting it parses cleanly)', () => {
    const r = CreateWorkOrderSchema.parse(base);
    expect(r.moment).toBeUndefined();
  });

  it('rejects a non-ISO moment string', () => {
    expect(() => CreateWorkOrderSchema.parse({ ...base, moment: '2026-05-01' })).toThrow();
    expect(() => CreateWorkOrderSchema.parse({ ...base, moment: 'not-a-date' })).toThrow();
  });
});

describe('UpdateWorkOrderSchema — fields optional, version REQUIRED (optimistic-lock)', () => {
  it('rejects payload without version (optimistic-lock guard)', () => {
    expect(() => UpdateWorkOrderSchema.parse({})).toThrow();
    expect(() => UpdateWorkOrderSchema.parse({ plannedQty: '10' })).toThrow();
  });

  it('accepts version-only payload (all other fields optional)', () => {
    const r = UpdateWorkOrderSchema.parse({ version: 0 });
    expect(r.version).toBe(0);
  });

  it('accepts partial update carrying version', () => {
    const r = UpdateWorkOrderSchema.parse({ plannedQty: '10', version: 3 });
    expect(r.plannedQty).toBe('10');
    expect(r.version).toBe(3);
  });

  it('accepts a moment edit carrying version', () => {
    const r = UpdateWorkOrderSchema.parse({ moment: '2026-05-02T00:00:00.000Z', version: 1 });
    expect(r.moment).toBe('2026-05-02T00:00:00.000Z');
  });

  it('rejects negative / non-integer version', () => {
    expect(() => UpdateWorkOrderSchema.parse({ version: -1 })).toThrow();
    expect(() => UpdateWorkOrderSchema.parse({ version: 1.5 })).toThrow();
  });
});

describe('TransitionWorkOrderSchema', () => {
  it('accepts state only', () => {
    const r = TransitionWorkOrderSchema.parse({ state: 'in_progress' });
    expect(r.state).toBe('in_progress');
    expect(r.producedQty).toBeUndefined();
  });

  it('accepts state + producedQty for completed', () => {
    const r = TransitionWorkOrderSchema.parse({ state: 'completed', producedQty: '10.5' });
    expect(r.producedQty).toBe('10.5');
  });

  it('rejects invalid producedQty format', () => {
    expect(() =>
      TransitionWorkOrderSchema.parse({ state: 'completed', producedQty: 'bad' }),
    ).toThrow();
  });
});

describe('BulkDeleteWorkOrderSchema', () => {
  it('accepts array of uuids', () => {
    const r = BulkDeleteWorkOrderSchema.parse({ ids: [UUID, UUID2] });
    expect(r.ids).toHaveLength(2);
  });

  it('rejects empty array', () => {
    expect(() => BulkDeleteWorkOrderSchema.parse({ ids: [] })).toThrow();
  });

  it('rejects non-uuid in array', () => {
    expect(() => BulkDeleteWorkOrderSchema.parse({ ids: ['not-uuid'] })).toThrow();
  });
});

describe('BulkTransitionWorkOrderSchema', () => {
  it('accepts ids + state (draft/in_progress/cancelled)', () => {
    for (const state of ['draft', 'in_progress', 'cancelled'] as const) {
      const r = BulkTransitionWorkOrderSchema.parse({ ids: [UUID, UUID2], state });
      expect(r.state).toBe(state);
      expect(r.ids).toHaveLength(2);
    }
  });

  it('rejects state=completed (single-item only — needs producedQty)', () => {
    expect(() =>
      BulkTransitionWorkOrderSchema.parse({ ids: [UUID], state: 'completed' }),
    ).toThrow();
  });

  it('rejects empty ids', () => {
    expect(() => BulkTransitionWorkOrderSchema.parse({ ids: [], state: 'draft' })).toThrow();
  });

  it('rejects > 100 ids', () => {
    const ids = Array.from({ length: 101 }, () => UUID);
    expect(() => BulkTransitionWorkOrderSchema.parse({ ids, state: 'draft' })).toThrow();
  });

  it('rejects unknown state', () => {
    expect(() => BulkTransitionWorkOrderSchema.parse({ ids: [UUID], state: 'mystery' })).toThrow();
  });
});

describe('WorkOrderFilterSchema', () => {
  it('defaults', () => {
    const r = WorkOrderFilterSchema.parse({});
    expect(r.limit).toBe(25);
    expect(r.sortDir).toBe('desc');
    expect(r.sortBy).toBe('createdAt');
  });

  it('parses state filter', () => {
    const r = WorkOrderFilterSchema.parse({ state: 'completed' });
    expect(r.state).toBe('completed');
  });

  it('accepts sortBy=moment (document date)', () => {
    const r = WorkOrderFilterSchema.parse({ sortBy: 'moment' });
    expect(r.sortBy).toBe('moment');
  });
});
