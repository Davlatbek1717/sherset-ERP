/**
 * Compact projection of an assigned HrSchedule for the employee-list "Jadval"
 * column — so the row payload carries a small summary instead of the full
 * day grid. Pure + co-located test. See spec §5.4.
 */

export interface ScheduleForSummary {
  id: string;
  name: string;
  type: string; // 'flexible' | 'free'
  cycleDays: number;
  days: { isWorkday: boolean; startTime: string | null; endTime: string | null }[];
}

export interface ScheduleSummary {
  id: string;
  name: string;
  isFlexible: boolean;
  workingDays: number;
  totalDays: number;
  /** "09:00–18:00" when every workday shares the same window, else "" (UI shows «Har xil»). */
  hoursLabel: string;
}

export function summarizeSchedule(s: ScheduleForSummary): ScheduleSummary {
  if (s.type === 'free') {
    // Free (Erkin) has no fixed times/day grid — every day is workable.
    return {
      id: s.id,
      name: s.name,
      isFlexible: false,
      workingDays: s.cycleDays,
      totalDays: s.cycleDays,
      hoursLabel: '',
    };
  }
  const working = s.days.filter((d) => d.isWorkday);
  let hoursLabel = '';
  if (working.length > 0) {
    const first = `${working[0]?.startTime ?? ''}–${working[0]?.endTime ?? ''}`;
    const allSame = working.every((d) => `${d.startTime ?? ''}–${d.endTime ?? ''}` === first);
    hoursLabel = allSame ? first : '';
  }
  return {
    id: s.id,
    name: s.name,
    isFlexible: true,
    workingDays: working.length,
    totalDays: s.cycleDays,
    hoursLabel,
  };
}
