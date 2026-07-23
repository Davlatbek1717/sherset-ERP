export interface InsideSample {
  inside: boolean;
  at: Date;
}
export type AttendanceDecision = 'KELDI' | 'KETDI' | 'NONE';
export interface ReducerInput {
  /** today's accepted pings, ascending by time */
  samples: InsideSample[];
  /** an un-checked-out HrAttendance exists today */
  hasOpenRecord: boolean;
  now: Date;
  arriveConsecutive?: number; // default 2
  leaveDebounceMs?: number; // default 180_000 (3 min)
}

/** Pure KELDI/KETDI decision. Mutually exclusive via hasOpenRecord. */
export function decideAttendance(input: ReducerInput): AttendanceDecision {
  const { samples, hasOpenRecord, now } = input;
  const arriveConsecutive = input.arriveConsecutive ?? 2;
  const leaveDebounceMs = input.leaveDebounceMs ?? 180_000;
  if (samples.length === 0) return 'NONE';

  if (!hasOpenRecord) {
    if (samples.length < arriveConsecutive) return 'NONE';
    return samples.slice(-arriveConsecutive).every((s) => s.inside) ? 'KELDI' : 'NONE';
  }

  // Open record -> trailing continuous inside=false run >= debounce.
  let runStart: Date | null = null;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    if (!s || s.inside) break;
    runStart = s.at;
  }
  if (!runStart) return 'NONE'; // last sample is inside -> still at work
  return now.getTime() - runStart.getTime() >= leaveDebounceMs ? 'KETDI' : 'NONE';
}
