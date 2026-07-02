import { z } from 'zod';

// «Отдел» (department / owner-group) — moysklad's `Group` reference behind every
// document's «Доступ» widget and each employee's «Владелец-отдел».
export const CreateGroupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  index: z.number().int().min(0).optional(),
});

export const UpdateGroupSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  index: z.number().int().min(0).optional(),
});

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
