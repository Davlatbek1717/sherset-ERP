import { z } from 'zod';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// One cycle day ("Kun N"). On a workday, start/end are required and ordered;
// an optional break must sit inside [start, end]. On a day-off, times are null.
const ScheduleDaySchema = z
  .object({
    dayIndex: z.number().int().min(1).max(31),
    isWorkday: z.boolean(),
    startTime: z.string().regex(TIME).nullable().default(null),
    endTime: z.string().regex(TIME).nullable().default(null),
    breakStart: z.string().regex(TIME).nullable().default(null),
    breakEnd: z.string().regex(TIME).nullable().default(null),
  })
  .superRefine((d, ctx) => {
    if (!d.isWorkday) return;
    if (!d.startTime || !d.endTime) {
      ctx.addIssue({ code: 'custom', message: 'Ish kuni uchun vaqt kiritilishi shart' });
      return;
    }
    if (d.startTime >= d.endTime) {
      ctx.addIssue({ code: 'custom', message: "Boshlanish tugashdan oldin bo'lishi kerak" });
    }
    if (d.breakStart || d.breakEnd) {
      if (!d.breakStart || !d.breakEnd || d.breakStart >= d.breakEnd) {
        ctx.addIssue({ code: 'custom', message: "Tanaffus oralig'i noto'g'ri" });
      } else if (d.breakStart < d.startTime || d.breakEnd > d.endTime) {
        ctx.addIssue({ code: 'custom', message: 'Tanaffus smena ichida bo‘lishi kerak' });
      }
    }
  });

export const HrScheduleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom kiritilishi shart').max(150),
    type: z.enum(['flexible', 'free']),
    startDate: z.string().regex(DATE, "Sana 'yyyy-MM-dd' formatida"),
    cycleDays: z.number().int().min(1).max(31).default(7),
    calcOvertime: z.boolean().default(false),
    extendedWorkMin: z.number().int().min(0).max(1440).default(240),
    days: z.array(ScheduleDaySchema).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.type !== 'flexible') return; // 'free' days are normalised away server-side
    if (s.days.length !== s.cycleDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['days'],
        message: `Kunlar soni ${s.cycleDays} bo'lishi kerak`,
      });
      return;
    }
    const idx = new Set(s.days.map((d) => d.dayIndex));
    for (let i = 1; i <= s.cycleDays; i++) {
      if (!idx.has(i)) {
        ctx.addIssue({ code: 'custom', path: ['days'], message: `Kun ${i} yetishmayapti` });
      }
    }
  });

export const HrScheduleFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['flexible', 'free']).optional(),
  archived: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type HrScheduleInput = z.infer<typeof HrScheduleInputSchema>;
export type HrScheduleFilter = z.infer<typeof HrScheduleFilterSchema>;
