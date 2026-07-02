import { z } from 'zod';

/** Manual snapshot trigger — admin can re-run a specific day (yyyy-mm-dd). */
export const SnapshotTriggerSchema = z.object({
  date: z.coerce.date().optional(), // default = today (Tashkent)
});
export type SnapshotTriggerInput = z.infer<typeof SnapshotTriggerSchema>;

/** Daily-log list filter for the KPI tab. */
export const KpiDailyFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});
export type KpiDailyFilter = z.infer<typeof KpiDailyFilterSchema>;
