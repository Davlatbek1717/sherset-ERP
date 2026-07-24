import { describe, expect, it } from 'vitest';
import { type ScheduleForSummary, summarizeSchedule } from './schedule-summary.util.js';

const flex = (days: ScheduleForSummary['days'], cycleDays = days.length): ScheduleForSummary => ({
  id: 's1',
  name: 'Ofis',
  type: 'flexible',
  cycleDays,
  days,
});

describe('summarizeSchedule', () => {
  it('counts working days and emits a shared hours label', () => {
    const s = flex([
      { isWorkday: true, startTime: '09:00', endTime: '18:00' },
      { isWorkday: true, startTime: '09:00', endTime: '18:00' },
      { isWorkday: false, startTime: null, endTime: null },
    ]);
    expect(summarizeSchedule(s)).toEqual({
      id: 's1',
      name: 'Ofis',
      isFlexible: true,
      workingDays: 2,
      totalDays: 3,
      hoursLabel: '09:00–18:00',
    });
  });

  it('returns an empty hours label when workdays differ', () => {
    const s = flex([
      { isWorkday: true, startTime: '09:00', endTime: '18:00' },
      { isWorkday: true, startTime: '10:00', endTime: '19:00' },
    ]);
    expect(summarizeSchedule(s).hoursLabel).toBe('');
    expect(summarizeSchedule(s).workingDays).toBe(2);
  });

  it('handles a free schedule (no day grid, never flexible)', () => {
    const s: ScheduleForSummary = { id: 's2', name: 'Erkin', type: 'free', cycleDays: 1, days: [] };
    expect(summarizeSchedule(s)).toEqual({
      id: 's2',
      name: 'Erkin',
      isFlexible: false,
      workingDays: 1,
      totalDays: 1,
      hoursLabel: '',
    });
  });

  it('all-day-off flexible schedule → 0 working days, empty label', () => {
    const s = flex([
      { isWorkday: false, startTime: null, endTime: null },
      { isWorkday: false, startTime: null, endTime: null },
    ]);
    expect(summarizeSchedule(s).workingDays).toBe(0);
    expect(summarizeSchedule(s).hoursLabel).toBe('');
  });
});
