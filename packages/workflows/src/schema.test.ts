import { describe, expect, it } from 'vitest';
import { FsmSchema } from './schema.ts';

describe('FsmSchema', () => {
  it('accepts a minimal valid FSM', () => {
    const minimal = {
      document: 'TestDoc',
      title: 'Тест',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'Draft', color: 'gray', default: true },
        { id: 'posted', label: 'Posted', color: 'green' },
      ],
      transitions: [
        {
          id: 'post',
          from: 'draft',
          to: 'posted',
          label: 'Provesti',
          triggerKind: 'button',
        },
      ],
    };

    const result = FsmSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects PascalCase state id', () => {
    const bad = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'Draft',
      states: [
        { id: 'Draft', label: 'Draft', color: 'gray' },
        { id: 'posted', label: 'Posted', color: 'green' },
      ],
      transitions: [],
    };
    const result = FsmSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects transition to non-existent state', () => {
    const bad = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'posted', label: 'P', color: 'green' },
      ],
      transitions: [
        {
          id: 'bad',
          from: 'draft',
          to: 'nonexistent',
          label: 'Bad',
          triggerKind: 'button',
        },
      ],
    };
    const result = FsmSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('nonexistent'))).toBe(true);
    }
  });

  it('rejects transition from non-existent state', () => {
    const bad = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'posted', label: 'P', color: 'green' },
      ],
      transitions: [
        {
          id: 'bad',
          from: 'unknown',
          to: 'posted',
          label: 'Bad',
          triggerKind: 'button',
        },
      ],
    };
    const result = FsmSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts pipe-separated from states', () => {
    const good = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'confirmed', label: 'C', color: 'blue' },
        { id: 'cancelled', label: 'X', color: 'red' },
      ],
      transitions: [
        {
          id: 'cancel',
          from: 'draft|confirmed',
          to: 'cancelled',
          label: 'Cancel',
          triggerKind: 'button',
        },
      ],
    };
    const result = FsmSchema.safeParse(good);
    expect(result.success).toBe(true);
  });

  it('accepts (soft-deleted) as destination', () => {
    const good = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'posted', label: 'P', color: 'green' },
      ],
      transitions: [
        {
          id: 'delete',
          from: 'draft',
          to: '(soft-deleted)',
          label: 'Delete',
          triggerKind: 'button',
        },
      ],
    };
    const result = FsmSchema.safeParse(good);
    expect(result.success).toBe(true);
  });

  it('rejects duplicate transition ids', () => {
    const bad = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'posted', label: 'P', color: 'green' },
      ],
      transitions: [
        { id: 'post', from: 'draft', to: 'posted', label: 'A', triggerKind: 'button' },
        { id: 'post', from: 'draft', to: 'posted', label: 'B', triggerKind: 'button' },
      ],
    };
    const result = FsmSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
    }
  });

  it('rejects more than one default state', () => {
    const bad = {
      document: 'TestDoc',
      title: 'T',
      entitySlug: 'testdoc',
      defaultStateName: 'draft',
      states: [
        { id: 'draft', label: 'D', color: 'gray', default: true },
        { id: 'posted', label: 'P', color: 'green', default: true },
      ],
      transitions: [],
    };
    const result = FsmSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
