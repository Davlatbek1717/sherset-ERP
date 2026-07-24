import { z } from 'zod';

// Bo'lim (department) name-catalog — pick-list for the free-text
// Employee.department string. Single field (name), mirrors HrRole shape
// but without the immutable `value`.
export const CreateHrDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Nom kiritilishi shart').max(150),
});

export const UpdateHrDepartmentSchema = CreateHrDepartmentSchema;

export type CreateHrDepartmentInput = z.infer<typeof CreateHrDepartmentSchema>;
export type UpdateHrDepartmentInput = z.infer<typeof UpdateHrDepartmentSchema>;
