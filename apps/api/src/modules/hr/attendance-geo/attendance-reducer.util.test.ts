import { describe, expect, it } from 'vitest';
import { decideAttendance } from './attendance-reducer.util.js';

const at = (min: number) => new Date(1_700_000_000_000 + min * 60_000);

describe('decideAttendance', () => {
  it('KELDI after 2 consecutive inside (no open record)', () => {
    expect(
      decideAttendance({
        samples: [
          { inside: true, at: at(0) },
          { inside: true, at: at(1) },
        ],
        hasOpenRecord: false,
        now: at(1),
      }),
    ).toBe('KELDI');
  });
  it('NONE when only last is inside', () => {
    expect(
      decideAttendance({
        samples: [
          { inside: false, at: at(0) },
          { inside: true, at: at(1) },
        ],
        hasOpenRecord: false,
        now: at(1),
      }),
    ).toBe('NONE');
  });
  it('KETDI after >=3 min continuous outside (open record)', () => {
    expect(
      decideAttendance({
        samples: [
          { inside: true, at: at(0) },
          { inside: false, at: at(1) },
          { inside: false, at: at(5) },
        ],
        hasOpenRecord: true,
        now: at(5),
      }),
    ).toBe('KETDI');
  });
  it('NONE when outside run <3 min', () => {
    expect(
      decideAttendance({
        samples: [
          { inside: true, at: at(0) },
          { inside: false, at: at(4) },
        ],
        hasOpenRecord: true,
        now: at(5),
      }),
    ).toBe('NONE');
  });
  it('NONE (still inside) when last sample inside & open', () => {
    expect(
      decideAttendance({
        samples: [
          { inside: false, at: at(0) },
          { inside: true, at: at(5) },
        ],
        hasOpenRecord: true,
        now: at(6),
      }),
    ).toBe('NONE');
  });
});
