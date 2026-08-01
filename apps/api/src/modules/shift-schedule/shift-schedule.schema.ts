import { z } from 'zod';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const CreateShiftScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  startTime: z.string().regex(TIME_REGEX, "Vaqt formati HH:MM bo'lishi kerak"),
  endTime: z.string().regex(TIME_REGEX, "Vaqt formati HH:MM bo'lishi kerak"),
});
export type CreateShiftScheduleInput = z.infer<typeof CreateShiftScheduleSchema>;

export const UpdateShiftScheduleSchema = CreateShiftScheduleSchema.partial();
export type UpdateShiftScheduleInput = z.infer<typeof UpdateShiftScheduleSchema>;
