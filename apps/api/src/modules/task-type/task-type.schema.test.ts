import { describe, expect, it } from 'vitest';
import {
  CreateTaskTypeSchema,
  TaskTypeFilterSchema,
  UpdateTaskTypeSchema,
} from './task-type.schema.js';

describe('CreateTaskTypeSchema', () => {
  it('accepts a minimal name-only payload', () => {
    const r = CreateTaskTypeSchema.safeParse({ name: 'Call' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('Call');
      expect(r.data.position).toBe(0);
      expect(r.data.color).toBeUndefined();
    }
  });

  it('accepts a full payload with hex colour and position', () => {
    const r = CreateTaskTypeSchema.safeParse({
      name: 'Meeting',
      color: '#16A34A',
      position: 5,
    });
    if (!r.success) throw r.error;
    expect(r.data.color).toBe('#16A34A');
    expect(r.data.position).toBe(5);
  });

  it('coerces position from string', () => {
    const r = CreateTaskTypeSchema.safeParse({ name: 'X', position: '3' });
    if (!r.success) throw r.error;
    expect(r.data.position).toBe(3);
  });

  it('trims whitespace from name', () => {
    const r = CreateTaskTypeSchema.safeParse({ name: '   Lead call   ' });
    if (!r.success) throw r.error;
    expect(r.data.name).toBe('Lead call');
  });

  it('rejects empty name', () => {
    expect(CreateTaskTypeSchema.safeParse({ name: '' }).success).toBe(false);
    expect(CreateTaskTypeSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an invalid colour', () => {
    expect(CreateTaskTypeSchema.safeParse({ name: 'X', color: 'red' }).success).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(CreateTaskTypeSchema.safeParse({ name: 'X', position: -1 }).success).toBe(false);
  });
});

describe('UpdateTaskTypeSchema', () => {
  it('accepts empty object (no-op patch)', () => {
    expect(UpdateTaskTypeSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial name change', () => {
    const r = UpdateTaskTypeSchema.safeParse({ name: 'Renamed' });
    if (!r.success) throw r.error;
    expect(r.data.name).toBe('Renamed');
  });
});

describe('TaskTypeFilterSchema', () => {
  it('defaults to sortBy=position asc, no archived filter', () => {
    const r = TaskTypeFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.sortBy).toBe('position');
    expect(r.data.sortDir).toBe('asc');
    expect(r.data.archived).toBeUndefined();
  });

  it('parses archived=true from string', () => {
    const r = TaskTypeFilterSchema.safeParse({ archived: 'true' });
    if (!r.success) throw r.error;
    expect(r.data.archived).toBe(true);
  });
});
