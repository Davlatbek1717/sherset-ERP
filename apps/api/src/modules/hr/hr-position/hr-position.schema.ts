import { z } from 'zod';

// Lavozim (position) name-catalog — pick-list for the free-text
// Employee.position string. Single field (name).
export const CreateHrPositionSchema = z.object({
  name: z.string().trim().min(1, 'Nom kiritilishi shart').max(150),
});

export const UpdateHrPositionSchema = CreateHrPositionSchema;

export type CreateHrPositionInput = z.infer<typeof CreateHrPositionSchema>;
export type UpdateHrPositionInput = z.infer<typeof UpdateHrPositionSchema>;
