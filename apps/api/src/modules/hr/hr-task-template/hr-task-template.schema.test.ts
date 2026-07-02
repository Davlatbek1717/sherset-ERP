import { describe, expect, it } from 'vitest';
import { CreateHrTaskTemplateSchema, ScheduleConfigSchema } from './hr-task-template.schema.js';

const minimal = {
  title: 'X',
  assignedEmployeeId: 'a4f6b9e0-1234-5678-9abc-def012345678',
  priority: 'medium',
  triggerType: 'manual',
  responseType: 'none',
  isActive: true,
};

describe('CreateHrTaskTemplateSchema (16-input)', () => {
  it('accepts minimal valid input (manual trigger, employee assignee)', () => {
    expect(() => CreateHrTaskTemplateSchema.parse(minimal)).not.toThrow();
  });

  it('rejects when neither assignedEmployeeId nor assignedRole', () => {
    expect(() =>
      CreateHrTaskTemplateSchema.parse({ ...minimal, assignedEmployeeId: undefined }),
    ).toThrow(/xodim yoki rolni tanlang/i);
  });

  it('rejects when both assignedEmployeeId and assignedRole', () => {
    expect(() => CreateHrTaskTemplateSchema.parse({ ...minimal, assignedRole: 'cashier' })).toThrow(
      /birini tanlang/i,
    );
  });

  it('scheduled trigger requires scheduleConfig', () => {
    expect(() =>
      CreateHrTaskTemplateSchema.parse({ ...minimal, triggerType: 'scheduled' }),
    ).toThrow(/scheduleConfig/);
  });

  it('event trigger requires eventConfig', () => {
    expect(() => CreateHrTaskTemplateSchema.parse({ ...minimal, triggerType: 'event' })).toThrow(
      /eventConfig/,
    );
  });

  it('rejects checker == assignedEmployee (anti-self-approval)', () => {
    expect(() =>
      CreateHrTaskTemplateSchema.parse({
        ...minimal,
        responseType: 'yes_no',
        checkerId: minimal.assignedEmployeeId,
      }),
    ).toThrow(/vazifa egasi/i);
  });

  it('rejects checker when responseType=none', () => {
    expect(() =>
      CreateHrTaskTemplateSchema.parse({
        ...minimal,
        checkerId: 'b4f6b9e0-1234-5678-9abc-def012345678',
      }),
    ).toThrow(/javob turi/i);
  });

  it('ScheduleConfig weekly requires days[]', () => {
    expect(() => ScheduleConfigSchema.parse({ time: '09:00', mode: 'weekly' })).toThrow(/days/);
  });

  it('ScheduleConfig monthly requires dayOfMonth', () => {
    expect(() => ScheduleConfigSchema.parse({ time: '09:00', mode: 'monthly' })).toThrow(
      /dayOfMonth/,
    );
  });

  it('ScheduleConfig invalid HH:MM format', () => {
    expect(() =>
      ScheduleConfigSchema.parse({ time: '25:99', mode: 'weekly', days: [1] }),
    ).toThrow();
  });

  it('priority defaults to medium', () => {
    const parsed = CreateHrTaskTemplateSchema.parse({
      title: 'X',
      assignedEmployeeId: minimal.assignedEmployeeId,
      triggerType: 'manual',
    });
    expect(parsed.priority).toBe('medium');
  });

  it('responseType defaults to none', () => {
    const parsed = CreateHrTaskTemplateSchema.parse({
      title: 'X',
      assignedEmployeeId: minimal.assignedEmployeeId,
      triggerType: 'manual',
    });
    expect(parsed.responseType).toBe('none');
  });
});
