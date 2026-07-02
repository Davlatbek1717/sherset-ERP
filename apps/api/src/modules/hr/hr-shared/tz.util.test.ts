import { describe, expect, it } from 'vitest';
import { parseLocalIso, startOfLocalDay, toLocalIso } from './tz.util.js';

describe('HR TZ helpers (Asia/Tashkent +05)', () => {
  it('toLocalIso formats UTC Date with +05:00 offset', () => {
    const utc = new Date('2026-05-20T07:30:00.000Z');
    expect(toLocalIso(utc)).toBe('2026-05-20T12:30:00+05:00');
  });

  it('toLocalIso(null) returns null', () => {
    expect(toLocalIso(null)).toBeNull();
    expect(toLocalIso(undefined)).toBeNull();
  });

  it('startOfLocalDay returns midnight in Tashkent TZ', () => {
    // 2026-05-20T03:45:00Z = 2026-05-20T08:45:00+05
    // start of that local day = 2026-05-19T19:00:00Z (which is 2026-05-20T00:00:00+05)
    const d = new Date('2026-05-20T03:45:00.000Z');
    const start = startOfLocalDay(d);
    expect(start.toISOString()).toBe('2026-05-19T19:00:00.000Z');
  });

  it('parseLocalIso reads +05:00 string back to UTC Date', () => {
    const local = '2026-05-20T12:30:00+05:00';
    const utc = parseLocalIso(local);
    expect(utc.toISOString()).toBe('2026-05-20T07:30:00.000Z');
  });

  it('startOfLocalDay handles late-evening UTC mapped to next local day', () => {
    // 2026-05-19T20:00:00Z = 2026-05-20T01:00:00+05
    // start of LOCAL day (2026-05-20) = 2026-05-19T19:00:00Z
    const d = new Date('2026-05-19T20:00:00.000Z');
    expect(startOfLocalDay(d).toISOString()).toBe('2026-05-19T19:00:00.000Z');
  });
});
