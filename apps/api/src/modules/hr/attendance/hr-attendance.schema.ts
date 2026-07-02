import { z } from 'zod';

export const CheckInSchema = z.object({
  employeeId: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
});

export const CheckOutSchema = z.object({}); // body bo'sh; URL'dan id keladi

export const EditAttendanceSchema = z.object({
  checkInTime: z.coerce.date().optional(),
  checkOutTime: z.coerce.date().nullable().optional(),
  clearCheckOut: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const ReportFilterSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  employeeId: z.string().uuid().optional(),
});

export const TodayFilterSchema = z.object({
  date: z.coerce.date().optional(), // default = today
});

export type CheckInInput = z.infer<typeof CheckInSchema>;
export type EditAttendanceInput = z.infer<typeof EditAttendanceSchema>;
export type ReportFilter = z.infer<typeof ReportFilterSchema>;
export type TodayFilter = z.infer<typeof TodayFilterSchema>;
