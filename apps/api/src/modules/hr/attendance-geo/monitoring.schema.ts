import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DailyMonitoringFilterSchema = z.object({
  date: z.string().regex(DATE, "Sana 'yyyy-MM-dd' formatida").optional(),
  status: z.enum(['all', 'late', 'ontime', 'at_work', 'absent']).default('all'),
});

export const MarksFilterSchema = z.object({
  from: z.string().regex(DATE, "Sana 'yyyy-MM-dd' formatida"),
  to: z.string().regex(DATE, "Sana 'yyyy-MM-dd' formatida"),
});

export type DailyMonitoringFilter = z.infer<typeof DailyMonitoringFilterSchema>;
export type MarksFilter = z.infer<typeof MarksFilterSchema>;
