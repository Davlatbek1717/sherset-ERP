import { z } from 'zod';

export const CreateHrRoleSchema = z.object({
  value: z
    .string()
    .min(2, 'Kamida 2 belgi')
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Faqat lotin kichik harf, raqam, _'),
  label: z.string().min(2).max(100),
});

export const UpdateHrRoleSchema = z.object({
  label: z.string().min(2).max(100),
});

export type CreateHrRoleInput = z.infer<typeof CreateHrRoleSchema>;
export type UpdateHrRoleInput = z.infer<typeof UpdateHrRoleSchema>;
