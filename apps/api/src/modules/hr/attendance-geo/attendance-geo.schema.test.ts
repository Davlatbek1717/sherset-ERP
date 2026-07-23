import { describe, expect, it } from 'vitest';
import { PingSchema, ScheduleWeekSchema, WorkLocationSchema } from './attendance-geo.schema.js';

describe('attendance-geo schemas', () => {
  it('PingSchema accepts valid', () => {
    expect(PingSchema.parse({ lat: 41.3, lng: 69.2, accuracy: 12 }).accuracy).toBe(12);
  });
  it('PingSchema rejects lat > 90', () => {
    expect(() => PingSchema.parse({ lat: 120, lng: 69, accuracy: 5 })).toThrow();
  });
  it('WorkLocationSchema defaults radius to 150', () => {
    expect(WorkLocationSchema.parse({ name: 'Ofis', lat: 41.3, lng: 69.2 }).radiusMeters).toBe(150);
  });
  it('ScheduleWeekSchema rejects start >= end on a work day', () => {
    expect(() =>
      ScheduleWeekSchema.parse({
        days: [{ weekday: 1, startTime: '18:00', endTime: '09:00', isDayOff: false }],
      }),
    ).toThrow();
  });
  it('ScheduleWeekSchema allows start >= end when isDayOff', () => {
    expect(
      ScheduleWeekSchema.parse({
        days: [{ weekday: 1, startTime: '00:00', endTime: '00:00', isDayOff: true }],
      }).days,
    ).toHaveLength(1);
  });
  it('ScheduleWeekSchema rejects duplicate weekday', () => {
    expect(() =>
      ScheduleWeekSchema.parse({
        days: [
          { weekday: 1, startTime: '09:00', endTime: '18:00', isDayOff: false },
          { weekday: 1, startTime: '10:00', endTime: '17:00', isDayOff: false },
        ],
      }),
    ).toThrow();
  });
});
